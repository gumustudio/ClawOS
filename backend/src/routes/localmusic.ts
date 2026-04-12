import { Router } from 'express';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import { createReadStream, statSync, existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as mm from 'music-metadata';
import { cloudsearch, lyric } from 'NeteaseCloudMusicApi';
import { ensureRemoteCoverCached, findNeteaseTrackCacheMatch, getNeteaseTrackCacheById, inferTitleArtistFromFilename, upsertNeteaseTrackCache } from '../utils/musicCache';
import { buildTrackSearchKeywords, scoreSearchMatch } from '../utils/musicMatching';
import { getServerPaths } from '../utils/serverConfig';

const router = Router();

const getMusicDir = async (req: any) => {
  const customDir = req.headers['x-music-dir'];
  if (customDir) {
    try {
      return decodeURIComponent(customDir);
    } catch(e) {
      return customDir;
    }
  }
  const paths = await getServerPaths();
  return paths.localMusicDir;
};

const getCacheDir = () => path.join(process.env.HOME || '/root', '.clawos', 'music_cache');
const getDbFile = () => path.join(getCacheDir(), 'db.json');
const getCoverCachePath = (trackId: string) => path.join(getCacheDir(), `${trackId}.jpg`);
const getLyricCachePath = (trackId: string) => path.join(getCacheDir(), `${trackId}.lrc`);

// Ensure cache directory exists
const initCache = async () => {
  try {
    await fs.mkdir(getCacheDir(), { recursive: true });
  } catch (e) {}
};
initCache();

interface LocalTrack {
  id: string; // hash of file path
  path: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  hasCover: boolean;
  hasLocalLrc: boolean;
  neteaseId?: number; // matched ID from netease
  neteaseSearched?: boolean;
  cachedCoverUrl?: string;
  cachedLyric?: boolean;
  metadataSource?: 'embedded' | 'netease-cache' | 'netease-live' | 'mixed';
  warmupFailed?: boolean;
  warmupFailureReason?: string;
  warmupAttempts?: number;
  lastWarmupAt?: string;
}

interface LocalMusicDbState {
  scannedDir: string;
  tracks: LocalTrack[];
}

interface WarmupStatus {
  scannedDir: string;
  running: boolean;
  total: number;
  completed: number;
  updated: number;
  currentTrack: string;
  lastRunAt: string | null;
}

let warmupStatus: WarmupStatus = {
  scannedDir: '',
  running: false,
  total: 0,
  completed: 0,
  updated: 0,
  currentTrack: '',
  lastRunAt: null
};

let activeWarmupPromise: Promise<void> | null = null;

const getHash = (str: string) => crypto.createHash('md5').update(str).digest('hex');

const getAudioMimeType = (filePath: string) => {
  switch (path.extname(filePath).toLowerCase()) {
    case '.flac':
      return 'audio/flac';
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    case '.aac':
      return 'audio/aac';
    case '.ogg':
      return 'audio/ogg';
    case '.mp3':
    default:
      return 'audio/mpeg';
  }
};

const loadDbState = async (): Promise<LocalMusicDbState> => {
  try {
    const data = await fs.readFile(getDbFile(), 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return { scannedDir: '', tracks: parsed };
    }

    return {
      scannedDir: typeof parsed.scannedDir === 'string' ? parsed.scannedDir : '',
      tracks: Array.isArray(parsed.tracks) ? parsed.tracks : []
    };
  } catch (e) {
    return { scannedDir: '', tracks: [] };
  }
};

const loadDb = async (): Promise<LocalTrack[]> => {
  const state = await loadDbState();
  return state.tracks;
};

const saveDbState = async (data: LocalMusicDbState) => {
  await fs.writeFile(getDbFile(), JSON.stringify(data, null, 2));
};

const saveDb = async (data: LocalTrack[], scannedDir = '') => {
  await saveDbState({ scannedDir, tracks: data });
};

// Scan Directory
const scanDirectory = async (dir: string): Promise<string[]> => {
  let results: string[] = [];
  try {
    const list = await fs.readdir(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        const subResults = await scanDirectory(fullPath);
        results = results.concat(subResults);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac'].includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch (e: any) {
    logger.error(`Scan Directory Error: ${e.message}`, { module: 'LocalMusic' });
  }
  return results;
};

// Search Netease for match
const searchNetease = async (keyword: string) => {
  try {
    const res = await cloudsearch({
      keywords: keyword,
      type: 1,
      limit: 10,
    });
    const result: any = res.body.result;
    if (res.status === 200 && result && result.songs && result.songs.length > 0) {
      return result.songs;
    }
  } catch (e: any) {
    logger.error(`Netease Search Error: ${e.message}`, { module: 'LocalMusic' });
  }
  return [];
};

const findBestNeteaseMatch = async (track: LocalTrack) => {
  const keywords = buildTrackSearchKeywords(track);

  let bestMatch: any = null;
  let bestScore = -1;

  for (const keyword of keywords) {
    const candidates = await searchNetease(keyword);
    for (const candidate of candidates) {
      const score = scoreSearchMatch(track, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }
    if (bestScore >= 18) {
      break;
    }
  }

  return bestMatch;
};

const applyCachedMetadata = async (track: LocalTrack) => {
  const coverPath = getCoverCachePath(track.id);
  const cachedLrcPath = getLyricCachePath(track.id);

  if (track.hasCover && !existsSync(coverPath)) {
    track.hasCover = false;
  }

  if (!track.hasLocalLrc && existsSync(cachedLrcPath)) {
    track.cachedLyric = true;
  }

  const titleArtist = inferTitleArtistFromFilename(track.path);
  const cacheEntry = await findNeteaseTrackCacheMatch({
    title: track.name || titleArtist.title,
    artist: track.artist !== 'Unknown Artist' ? track.artist : titleArtist.artist
  });

  if (!cacheEntry) {
    return track;
  }

  track.metadataSource = track.metadataSource === 'embedded' ? 'mixed' : 'netease-cache';

  track.neteaseId = Number(cacheEntry.neteaseId);

  if ((track.artist === 'Unknown Artist' || !track.artist) && cacheEntry.artist) {
    track.artist = cacheEntry.artist;
  }

  if ((track.album === 'Unknown Album' || !track.album) && cacheEntry.album) {
    track.album = cacheEntry.album;
  }

  if (!track.hasCover && cacheEntry.coverUrl) {
    const cached = await ensureRemoteCoverCached(cacheEntry.coverUrl, coverPath);
    track.hasCover = cached || track.hasCover;
    track.cachedCoverUrl = cacheEntry.coverUrl;
  }

  if (!track.hasLocalLrc && cacheEntry.lyric) {
    await fs.writeFile(cachedLrcPath, cacheEntry.lyric, 'utf8');
    track.cachedLyric = true;
  }

  return track;
};

const fetchNeteaseLyricText = async (neteaseId: number) => {
  try {
    const result = await lyric({ id: neteaseId });
    const lrcData: any = result.body.lrc;
    if (result.status === 200 && lrcData && lrcData.lyric) {
      return lrcData.lyric as string;
    }
  } catch (e: any) {
    logger.error(`Fetch Netease lyric failed: ${e.message}`, { module: 'LocalMusic' });
  }
  return '';
};

const readTrackLyricText = async (track: LocalTrack) => {
  const lyricPaths = [
    track.hasLocalLrc ? `${track.path.substring(0, track.path.lastIndexOf('.'))}.lrc` : '',
    existsSync(getLyricCachePath(track.id)) ? getLyricCachePath(track.id) : ''
  ].filter(Boolean);

  for (const lyricPath of lyricPaths) {
    try {
      return await fs.readFile(lyricPath, 'utf8');
    } catch (error) {
      logger.error(`Read cached lyric failed: ${(error as Error).message}`, { module: 'LocalMusic' });
    }
  }

  return '';
};

const syncTrackCacheEntry = async (track: LocalTrack) => {
  if (!track.neteaseId) {
    return;
  }

  const existingEntry = await getNeteaseTrackCacheById(String(track.neteaseId));
  const lyricText = !existingEntry?.lyric && (track.hasLocalLrc || track.cachedLyric)
    ? await readTrackLyricText(track)
    : '';

  if (
    existingEntry &&
    existingEntry.title &&
    existingEntry.artist &&
    existingEntry.album &&
    (!lyricText || existingEntry.lyric)
  ) {
    return;
  }

  await upsertNeteaseTrackCache({
    neteaseId: String(track.neteaseId),
    title: track.name,
    artist: track.artist,
    album: track.album,
    coverUrl: track.cachedCoverUrl,
    lyric: lyricText
  });
};

const warmTrackMetadata = async (track: LocalTrack) => {
  await applyCachedMetadata(track);

  const attempts = track.warmupAttempts || 0;
  const failureBudgetReached = track.warmupFailed && attempts >= 3;
  if (failureBudgetReached) {
    return track;
  }

  const hasCachedLyric = existsSync(getLyricCachePath(track.id));
  const needsRemoteWarmup = !track.neteaseSearched || !track.neteaseId || !track.hasCover || (!track.hasLocalLrc && !hasCachedLyric) || track.artist === 'Unknown Artist' || track.album === 'Unknown Album';
  if (!needsRemoteWarmup) {
    await syncTrackCacheEntry(track);
    return track;
  }

  const match = await findBestNeteaseMatch(track);
  track.neteaseSearched = true;
  track.warmupAttempts = attempts + 1;
  track.lastWarmupAt = new Date().toISOString();

  if (!match) {
    track.warmupFailed = true;
    track.warmupFailureReason = '未找到足够接近的网易云匹配结果';
    return track;
  }

  track.warmupFailed = false;
  track.warmupFailureReason = undefined;
  track.neteaseId = match.id;
  track.metadataSource = track.metadataSource === 'embedded' ? 'mixed' : 'netease-live';
  if (track.artist === 'Unknown Artist' && match.ar?.[0]?.name) {
    track.artist = match.ar[0].name;
  }
  if (track.album === 'Unknown Album' && match.al?.name) {
    track.album = match.al.name;
  }

  let lyricText = '';
  if (!track.hasLocalLrc && !existsSync(getLyricCachePath(track.id))) {
    lyricText = await fetchNeteaseLyricText(match.id);
    if (lyricText) {
      await fs.writeFile(getLyricCachePath(track.id), lyricText, 'utf8');
      track.cachedLyric = true;
    }
  }

  if (!track.hasCover && match.al?.picUrl) {
    const coverCached = await ensureRemoteCoverCached(match.al.picUrl, getCoverCachePath(track.id));
    track.hasCover = coverCached;
    track.cachedCoverUrl = match.al.picUrl;
  }

  await upsertNeteaseTrackCache({
    neteaseId: String(match.id),
    title: match.name || track.name,
    artist: match.ar?.[0]?.name || track.artist,
    album: match.al?.name || track.album,
    durationMs: match.dt,
    coverUrl: match.al?.picUrl,
    lyric: lyricText,
    aliases: match.alia || []
  });

  await new Promise(resolve => setTimeout(resolve, 200));
  return applyCachedMetadata(track);
};

const warmLibraryMetadata = async (tracks: LocalTrack[], scannedDir: string) => {
  warmupStatus = {
    scannedDir,
    running: true,
    total: tracks.length,
    completed: 0,
    updated: 0,
    currentTrack: '',
    lastRunAt: new Date().toISOString()
  };

  let changed = false;
  for (const track of tracks) {
    warmupStatus.currentTrack = track.name;
    const before = JSON.stringify(track);
    await warmTrackMetadata(track);
    if (JSON.stringify(track) !== before) {
      changed = true;
      warmupStatus.updated += 1;
      await saveDbState({ scannedDir, tracks });
    }
    warmupStatus.completed += 1;
  }

  if (changed) {
    await saveDbState({ scannedDir, tracks });
  }

  warmupStatus = {
    ...warmupStatus,
    running: false,
    currentTrack: ''
  };
};

const ensureWarmLibraryMetadata = (tracks: LocalTrack[], scannedDir: string) => {
  if (activeWarmupPromise) {
    return activeWarmupPromise;
  }

  activeWarmupPromise = warmLibraryMetadata(tracks, scannedDir)
    .catch((error) => {
      logger.error(`Warm metadata library failed: ${(error as Error).message}`, { module: 'LocalMusic' });
      warmupStatus = {
        ...warmupStatus,
        running: false,
        currentTrack: ''
      };
    })
    .finally(() => {
      activeWarmupPromise = null;
    });

  return activeWarmupPromise;
};

const augmentMetadataBackground = async (db: LocalTrack[], scannedDir: string) => {
  let updated = false;
  for (let i = 0; i < db.length; i++) {
    const track = db[i];
    if ((!track.hasCover || !track.hasLocalLrc) && !track.neteaseSearched) {
      try {
        await warmTrackMetadata(track);
        updated = true;
      } catch (e: any) {
        logger.error(`Augment Error for ${track.name}: ${e.message}`, { module: 'LocalMusic' });
      }
    }
  }
  
  if (updated) {
    await saveDbState({ scannedDir, tracks: db });
  }
};

router.post('/scan', async (req, res) => {
  const musicDir = await getMusicDir(req);
  if (!existsSync(musicDir)) {
    return res.status(400).json({ success: false, error: 'Music directory does not exist' });
  }

  try {
    const files = await scanDirectory(musicDir);
    const existingState = await loadDbState();
    const db = existingState.scannedDir === musicDir ? existingState.tracks : [];
    const newDb: LocalTrack[] = [];

    for (const file of files) {
      const id = getHash(file);
      const existing = db.find(t => t.id === id);
      
      if (existing && existing.path === file) {
        newDb.push(await applyCachedMetadata({ ...existing }));
        continue;
      }

      // Parse new file
      try {
        const metadata = await mm.parseFile(file, { duration: true, skipCovers: false });
        const name = metadata.common.title || path.basename(file, path.extname(file));
        const artist = metadata.common.artist || 'Unknown Artist';
        const album = metadata.common.album || 'Unknown Album';
        
        let hasCover = false;
        if (metadata.common.picture && metadata.common.picture.length > 0) {
          const coverPath = getCoverCachePath(id);
          await fs.writeFile(coverPath, metadata.common.picture[0].data);
          hasCover = true;
        }

        const lrcPath = file.substring(0, file.lastIndexOf('.')) + '.lrc';
        const hasLocalLrc = existsSync(lrcPath);

        const track: LocalTrack = {
          id,
          path: file,
          name,
          artist,
          album,
          duration: metadata.format.duration || 0,
          hasCover,
          hasLocalLrc,
          neteaseSearched: false,
          cachedLyric: false,
          metadataSource: hasCover || hasLocalLrc ? 'embedded' : undefined,
          warmupAttempts: 0,
          warmupFailed: false
        };

        newDb.push(await warmTrackMetadata(track));
      } catch (me: any) {
        logger.error(`Parse ID3 Error for ${file}: ${me.message}`, { module: 'LocalMusic' });
        // Fallback to filename
        const fallbackTrack: LocalTrack = {
          id,
          path: file,
          name: path.basename(file, path.extname(file)),
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 0,
          hasCover: false,
          hasLocalLrc: false,
          neteaseSearched: false,
          cachedLyric: false,
          warmupAttempts: 0,
          warmupFailed: false
        };
        newDb.push(await warmTrackMetadata(fallbackTrack));
      }
    }

    await saveDb(newDb, musicDir);
    res.json({ success: true, data: newDb });

    // Trigger background augment
    ensureWarmLibraryMetadata(newDb, musicDir);
    augmentMetadataBackground(newDb, musicDir).catch((error) => {
      logger.error(`Augment metadata background failed: ${(error as Error).message}`, { module: 'LocalMusic' });
    });

  } catch (error: any) {
    logger.error(`Scan Error: ${error.message}`, { module: 'LocalMusic' });
    res.status(500).json({ success: false, error: 'Scan failed' });
  }
});

router.get('/list', async (req, res) => {
  const musicDir = await getMusicDir(req);
  const state = await loadDbState();

  if (state.scannedDir && state.scannedDir !== musicDir) {
    return res.json({ success: true, data: [], needsScan: true });
  }

  const enrichedTracks = await Promise.all(state.tracks.map(track => applyCachedMetadata({ ...track })));
  for (const track of enrichedTracks) {
    await syncTrackCacheEntry(track);
  }
  const changed = JSON.stringify(enrichedTracks) !== JSON.stringify(state.tracks);
  if (changed) {
    await saveDbState({ scannedDir: state.scannedDir, tracks: enrichedTracks });
  }

  if (enrichedTracks.length > 0) {
    ensureWarmLibraryMetadata(enrichedTracks, state.scannedDir);
  }

  res.json({ success: true, data: enrichedTracks, needsScan: enrichedTracks.length === 0 });
});

router.get('/warmup-status', async (req, res) => {
  res.json({ success: true, data: warmupStatus });
});

router.get('/cover/:id', async (req, res) => {
  const coverPath = getCoverCachePath(req.params.id);
  if (existsSync(coverPath)) {
    res.sendFile(coverPath, { dotfiles: 'allow' });
  } else {
    // Return a default transparent pixel or 404
    res.status(404).send('Not found');
  }
});

router.get('/lyric/:id', async (req, res) => {
  const db = await loadDb();
  const track = db.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ success: false, error: 'Track not found' });

  // 1. Try local LRC
  if (track.hasLocalLrc) {
    const lrcPath = track.path.substring(0, track.path.lastIndexOf('.')) + '.lrc';
    try {
      const lrcContent = await fs.readFile(lrcPath, 'utf-8');
      return res.json({ success: true, lyric: lrcContent });
    } catch (e) {}
  }

  // 2. Try Netease cache
  const cachedLrcPath = getLyricCachePath(track.id);
  if (existsSync(cachedLrcPath)) {
    const lrcContent = await fs.readFile(cachedLrcPath, 'utf-8');
    return res.json({ success: true, lyric: lrcContent });
  }

  const cacheEntry = await findNeteaseTrackCacheMatch({
    title: track.name,
    artist: track.artist,
  });
  if (cacheEntry?.lyric) {
    await fs.writeFile(cachedLrcPath, cacheEntry.lyric, 'utf8');
    return res.json({ success: true, lyric: cacheEntry.lyric });
  }

  // 3. Fetch from Netease API
  if (track.neteaseId) {
    try {
      const result = await lyric({ id: track.neteaseId });
      const lrcData: any = result.body.lrc;
      if (result.status === 200 && lrcData && lrcData.lyric) {
        const lyric = lrcData.lyric;
        await fs.writeFile(cachedLrcPath, lyric);
        await upsertNeteaseTrackCache({
          neteaseId: String(track.neteaseId),
          title: track.name,
          artist: track.artist,
          album: track.album,
          lyric
        });
        return res.json({ success: true, lyric });
      }
    } catch (e) {
       logger.error(`Fetch Lyric Error: ${(e as any).message}`, { module: 'LocalMusic' });
    }
  }

  res.json({ success: true, lyric: '' });
});

// Stream endpoint with Range support
router.get('/stream/:id', async (req, res) => {
  const db = await loadDb();
  const track = db.find(t => t.id === req.params.id);
  
  if (!track || !existsSync(track.path)) {
    return res.status(404).send('File not found');
  }

  const stat = statSync(track.path);
  const fileSize = stat.size;
  const range = req.headers.range;
  const mimeType = getAudioMimeType(track.path);

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= fileSize) {
      return res.status(416).send('Invalid range');
    }
    const chunksize = (end - start) + 1;
    const file = createReadStream(track.path, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Accept-Ranges': 'bytes',
      'Content-Length': fileSize,
      'Content-Type': mimeType,
    };
    res.writeHead(200, head);
    createReadStream(track.path).pipe(res);
  }
});

export default router;
