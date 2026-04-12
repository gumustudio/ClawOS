import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from './logger';

let trackCacheWriteQueue: Promise<void> = Promise.resolve();

const getMusicCacheDir = () => path.join(process.env.HOME || '/root', '.clawos', 'music_cache');
const getNeteaseTrackCacheFile = () => path.join(getMusicCacheDir(), 'netease_tracks.json');

export interface NeteaseTrackCacheEntry {
  neteaseId: string;
  title: string;
  artist: string;
  album: string;
  durationMs?: number;
  coverUrl?: string;
  lyric?: string;
  aliases?: string[];
  matchKeys: string[];
  updatedAt: string;
}

interface NeteaseTrackCacheInput {
  neteaseId: string;
  title: string;
  artist: string;
  album: string;
  durationMs?: number;
  coverUrl?: string;
  lyric?: string;
  aliases?: string[];
}

const normalizeValue = (value: string) => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s._\-()[\]{}【】（）'"`~!@#$%^&*+=|\\/:;<>,?，。！？、·]+/g, '');

const unique = <T>(values: T[]) => Array.from(new Set(values));

const buildMatchKeys = (title: string, artist: string, aliases: string[] = []) => {
  const baseKeys = [
    `${title} - ${artist}`,
    `${title}-${artist}`,
    title,
    ...aliases,
    ...aliases.map(alias => `${alias} - ${artist}`)
  ];

  return unique(baseKeys.map(normalizeValue).filter(Boolean));
};

export async function ensureMusicCacheDir() {
  await fs.mkdir(getMusicCacheDir(), { recursive: true });
}

export async function loadNeteaseTrackCache(): Promise<NeteaseTrackCacheEntry[]> {
  try {
    const raw = await fs.readFile(getNeteaseTrackCacheFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveNeteaseTrackCache(entries: NeteaseTrackCacheEntry[]) {
  await ensureMusicCacheDir();
  const cacheFile = getNeteaseTrackCacheFile();
  const tempFile = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(entries, null, 2), 'utf8');
  await fs.rename(tempFile, cacheFile);
}

async function withTrackCacheWriteLock<T>(task: () => Promise<T>) {
  const runTask = trackCacheWriteQueue.then(task, task);
  trackCacheWriteQueue = runTask.then(() => undefined, () => undefined);
  return runTask;
}

export async function getNeteaseTrackCacheById(neteaseId: string) {
  const entries = await loadNeteaseTrackCache();
  return entries.find(entry => entry.neteaseId === neteaseId) || null;
}

export async function findNeteaseTrackCacheMatch(options: {
  title: string;
  artist?: string;
  aliases?: string[];
}) {
  const entries = await loadNeteaseTrackCache();
  const candidateKeys = buildMatchKeys(options.title, options.artist || '', options.aliases || []);

  const exactArtistMatch = entries.find(entry => {
    if (!options.artist) return false;
    return candidateKeys.some(key => entry.matchKeys.includes(key));
  });

  if (exactArtistMatch) {
    return exactArtistMatch;
  }

  const titleOnlyKey = normalizeValue(options.title);
  return entries.find(entry => entry.matchKeys.includes(titleOnlyKey)) || null;
}

export async function upsertNeteaseTrackCache(input: NeteaseTrackCacheInput) {
  try {
    return await withTrackCacheWriteLock(async () => {
      const entries = await loadNeteaseTrackCache();
      const existing = entries.find(entry => entry.neteaseId === input.neteaseId);
      const aliases = unique([...(existing?.aliases || []), ...(input.aliases || [])]).filter(Boolean);

      const nextEntry: NeteaseTrackCacheEntry = {
        neteaseId: input.neteaseId,
        title: input.title || existing?.title || '',
        artist: input.artist || existing?.artist || '',
        album: input.album || existing?.album || '',
        durationMs: input.durationMs ?? existing?.durationMs,
        coverUrl: input.coverUrl || existing?.coverUrl,
        lyric: input.lyric || existing?.lyric,
        aliases,
        matchKeys: buildMatchKeys(
          input.title || existing?.title || '',
          input.artist || existing?.artist || '',
          aliases
        ),
        updatedAt: new Date().toISOString()
      };

      const nextEntries = entries.filter(entry => entry.neteaseId !== input.neteaseId);
      nextEntries.unshift(nextEntry);
      await saveNeteaseTrackCache(nextEntries.slice(0, 5000));
      return nextEntry;
    });
  } catch (error) {
    logger.error(`Upsert Netease track cache failed: ${(error as Error).message}`, { module: 'MusicCache' });
    throw error;
  }
}

export async function ensureRemoteCoverCached(coverUrl: string, outputPath: string) {
  if (!coverUrl) {
    return false;
  }

  if (existsSync(outputPath)) {
    return true;
  }

  try {
    const response = await fetch(coverUrl);
    if (!response.ok) {
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
    return true;
  } catch (error) {
    logger.error(`Cache remote cover failed: ${(error as Error).message}`, { module: 'MusicCache' });
    return false;
  }
}

export function inferTitleArtistFromFilename(filePath: string) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const separator = baseName.includes(' - ') ? ' - ' : baseName.includes('-') ? '-' : null;

  if (!separator) {
    return {
      title: baseName.trim(),
      artist: 'Unknown Artist'
    };
  }

  const [title, artist] = baseName.split(separator).map(part => part.trim());
  return {
    title: title || baseName.trim(),
    artist: artist || 'Unknown Artist'
  };
}

export function cleanupTrackTitle(title: string) {
  return title
    .replace(/（[^）]*无损[^）]*）/gi, '')
    .replace(/\([^)]*无损[^)]*\)/gi, '')
    .replace(/（Live[^）]*）/gi, '')
    .replace(/\(Live[^)]*\)/gi, '')
    .replace(/（伴奏[^）]*）/gi, '')
    .replace(/\(伴奏[^)]*\)/gi, '')
    .replace(/（[^）]*版）/gi, '')
    .replace(/\([^)]*版\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSearchKeywords(title: string, artist?: string) {
  const cleanTitle = cleanupTrackTitle(title);
  const cleanArtist = (artist || '').trim();
  const keywords = [
    `${cleanTitle} ${cleanArtist}`.trim(),
    `${title} ${cleanArtist}`.trim(),
    cleanTitle,
    title.trim()
  ];

  return unique(keywords.filter(Boolean));
}
