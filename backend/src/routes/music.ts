import { Router } from 'express';
import { search, song_url_v1, lyric, song_detail, login_qr_key, login_qr_create, login_qr_check, login_status, user_playlist, playlist_track_all } from 'NeteaseCloudMusicApi';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import path from 'path';
import { getNeteaseTrackCacheById, upsertNeteaseTrackCache } from '../utils/musicCache';
import { getAria2RpcUrl, getAria2Secret } from '../utils/localServices';
import { readPersistedNeteaseCookie, writePersistedNeteaseCookie } from '../utils/neteaseAuth';

const router = Router();

let neteaseCookie = '';

const ARIA2_CONF_PATH = path.join(process.env.HOME || '/root', '.aria2', 'aria2.conf');
const DOWNLOAD_MAP_FILE = path.join(process.env.HOME || '/root', '.clawos', 'music_cache', 'netease_download_map.json');
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus']);
const COVER_CACHE_DIR = path.join(process.env.HOME || '/root', '.clawos', 'music_cache', 'netease_covers');

interface DownloadedTrack {
    filename: string;
    baseName: string;
    normalizedName: string;
    extension: string;
    songIds: string[];
}

interface DownloadMapEntry {
    songId: string;
    filename: string;
    dir: string;
    title: string;
    artist: string;
    quality: string;
    createdAt: string;
}

const standardizeSong = (source: string, original: any, title: string, artist: string, album: string, durationStr: string, id: string, cover: string) => ({
    source, original, title, artist, album, duration: durationStr, id, cover
});

async function getNeteaseCookie() {
    if (neteaseCookie) {
        return neteaseCookie;
    }

    neteaseCookie = await readPersistedNeteaseCookie();
    return neteaseCookie;
}

async function setNeteaseCookie(cookie: string) {
    neteaseCookie = await writePersistedNeteaseCookie(cookie);
    return neteaseCookie;
}

async function searchNetease(keyword: string) {
    try {
        const cookie = await getNeteaseCookie();
        const res = await search({ keywords: keyword, limit: 30, cookie, timestamp: Date.now() } as any);
        const songs = (res.body as any).result?.songs || [];
        return await Promise.all(songs.map(async (s: any) => {
            const durationMs = s.duration || s.dt || 0;
            const minutes = Math.floor(durationMs / 60000);
            const seconds = Math.floor((durationMs % 60000) / 1000);
            const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            const cover = s.al?.picUrl || s.album?.picUrl || await resolveCoverUrl(String(s.id));
            await upsertNeteaseTrackCache({
                neteaseId: s.id.toString(),
                title: s.name,
                artist: s.artists?.[0]?.name || s.ar?.[0]?.name || 'Unknown',
                album: s.album?.name || s.al?.name || 'Unknown',
                durationMs,
                coverUrl: cover,
                aliases: s.alias || s.alia || []
            });
            return standardizeSong('netease', s, s.name, s.artists?.[0]?.name || s.ar?.[0]?.name || 'Unknown', s.album?.name || s.al?.name || 'Unknown', durationStr, s.id.toString(), cover);
        }));
    } catch (e) {
        logger.error(`Netease search error: ${e}`, { module: 'Music' });
        return [];
    }
}

async function getNeteaseUrl(id: string, level: string = 'lossless') {
    try {
        const cookie = await getNeteaseCookie();
        const res = await song_url_v1({ id: id, level: level, cookie, timestamp: Date.now() } as any);
        const data = (res.body as any).data;
        if (data && data.length > 0) {
            return data[0].url;
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function ensureCoverCacheDir() {
    await fs.promises.mkdir(COVER_CACHE_DIR, { recursive: true });
}

async function ensureMusicCacheDir() {
    await fs.promises.mkdir(path.dirname(DOWNLOAD_MAP_FILE), { recursive: true });
}

async function loadDownloadMap(): Promise<DownloadMapEntry[]> {
    try {
        const raw = await fs.promises.readFile(DOWNLOAD_MAP_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function saveDownloadMap(entries: DownloadMapEntry[]) {
    await ensureMusicCacheDir();
    await fs.promises.writeFile(DOWNLOAD_MAP_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

async function upsertDownloadMap(entry: DownloadMapEntry) {
    const entries = await loadDownloadMap();
    const filtered = entries.filter(existing => !(existing.songId === entry.songId && existing.filename === entry.filename && existing.dir === entry.dir));
    filtered.unshift(entry);
    await saveDownloadMap(filtered.slice(0, 1000));
}

async function resolveDownloadedSongIds(filename: string, dir: string) {
    const entries = await loadDownloadMap();
    return entries
        .filter(entry => entry.filename === filename && entry.dir === dir)
        .map(entry => entry.songId);
}

function buildDownloadFilename(title: string, artist: string, ext: string) {
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').trim();
    const safeArtist = artist.replace(/[\\/:*?"<>|]/g, '_').trim();
    return `${safeTitle} - ${safeArtist}.${ext}`;
}

async function pushToAria2(url: string, filename: string, dir?: string) {
    const params = [
        `token:${getAria2Secret()}`,
        [url],
        { out: filename, ...(dir ? { dir } : {}) }
    ];

    const response = await fetch(getAria2RpcUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now().toString(),
            method: 'aria2.addUri',
            params
        })
    });

    return response.json();
}

async function getSongDetailData(id: string) {
    const cached = await getNeteaseTrackCacheById(id);
    const cookie = await getNeteaseCookie();
    const result = await song_detail({ ids: id, cookie, timestamp: Date.now() } as any);
    const song = (result.body as any).songs?.[0];
    if (song) {
        await upsertNeteaseTrackCache({
            neteaseId: id,
            title: song.name || cached?.title || '',
            artist: song.ar?.[0]?.name || song.artists?.[0]?.name || cached?.artist || '',
            album: song.al?.name || song.album?.name || cached?.album || '',
            durationMs: song.dt || cached?.durationMs,
            coverUrl: song.al?.picUrl || song.album?.picUrl || cached?.coverUrl,
            aliases: song.alia || cached?.aliases || []
        });
    }
    return song;
}

async function resolveCoverUrl(id: string) {
    const cached = await getNeteaseTrackCacheById(id);
    if (cached?.coverUrl) {
        return cached.coverUrl;
    }

    const cachedPath = path.join(COVER_CACHE_DIR, `${id}.txt`);
    if (fs.existsSync(cachedPath)) {
        const cached = fs.readFileSync(cachedPath, 'utf8').trim();
        if (cached) {
            return cached;
        }
    }

    const song = await getSongDetailData(id);
    const cover = song?.al?.picUrl || song?.album?.picUrl || '';
    if (cover) {
        await ensureCoverCacheDir();
        await fs.promises.writeFile(cachedPath, cover, 'utf8');
        await upsertNeteaseTrackCache({
            neteaseId: id,
            title: song?.name || cached?.title || '',
            artist: song?.ar?.[0]?.name || song?.artists?.[0]?.name || cached?.artist || '',
            album: song?.al?.name || song?.album?.name || cached?.album || '',
            durationMs: song?.dt || cached?.durationMs,
            coverUrl: cover,
            aliases: song?.alia || cached?.aliases || []
        });
    }
    return cover;
}

function normalizeSongName(value: string) {
    return value
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\s._\-()[\]{}【】（）'"`~!@#$%^&*+=|\\/:;<>,?，。！？、·]+/g, '');
}

function resolveDownloadDir(dir?: string) {
    const explicitDir = (dir || '').trim();
    if (explicitDir) {
        return explicitDir;
    }

    if (!fs.existsSync(ARIA2_CONF_PATH)) {
        return '';
    }

    const confContent = fs.readFileSync(ARIA2_CONF_PATH, 'utf8');
    const match = confContent.match(/^dir=(.+)$/m);
    return match?.[1]?.trim() || '';
}

function getAudioMimeType(filename: string) {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
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
        case '.opus':
            return 'audio/ogg; codecs=opus';
        case '.mp3':
        default:
            return 'audio/mpeg';
    }
}

function scanAudioFilesRecursive(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const results: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...scanAudioFilesRecursive(fullPath));
            continue;
        }

        if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            results.push(fullPath);
        }
    }

    return results;
}

async function listDownloadedTracks(dir?: string): Promise<{ dir: string; tracks: DownloadedTrack[] }> {
    const targetDir = resolveDownloadDir(dir);
    if (!targetDir || !fs.existsSync(targetDir)) {
        return { dir: '', tracks: [] };
    }

    const audioFiles = scanAudioFilesRecursive(targetDir);

    const trackPromises = audioFiles.map(async (fullPath) => {
            const relativeFilename = path.relative(targetDir, fullPath);
            const extension = path.extname(relativeFilename).toLowerCase();
            const baseName = path.basename(relativeFilename, extension);
            return {
                filename: relativeFilename,
                baseName,
                normalizedName: normalizeSongName(baseName),
                extension,
                songIds: await resolveDownloadedSongIds(relativeFilename, targetDir)
            };
        });

    const tracks = await Promise.all(trackPromises);

    return { dir: targetDir, tracks };
}

router.get('/search', async (req, res) => {
    const keyword = req.query.keyword as string;
    if (!keyword) return res.status(400).json({ success: false, error: 'Keyword is required' });
    const results = await searchNetease(keyword);
    res.json({ success: true, data: results });
});

router.get('/play', async (req, res) => {
    const id = req.query.id as string;
    const level = (req.query.level as string) || 'lossless';
    if (!id) return res.status(400).json({ success: false, error: 'id is required' });
    const url = await getNeteaseUrl(id, level);
    if (url) {
        res.json({ success: true, data: { url } });
    } else {
        res.status(404).json({ success: false, error: 'URL not found or VIP required without valid cookie' });
    }
});

router.get('/lyric', async (req, res) => {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ success: false, error: 'id is required' });
    try {
        const cookie = await getNeteaseCookie();
        const result = await lyric({ id, cookie, timestamp: Date.now() } as any);
        const body = result.body as any;
        const lyricText = body?.lrc?.lyric || '';
        const cached = await getNeteaseTrackCacheById(id);
        const song = await getSongDetailData(id).catch(() => null);
        await upsertNeteaseTrackCache({
            neteaseId: id,
            title: song?.name || cached?.title || '',
            artist: song?.ar?.[0]?.name || song?.artists?.[0]?.name || cached?.artist || '',
            album: song?.al?.name || song?.album?.name || cached?.album || '',
            durationMs: song?.dt || cached?.durationMs,
            coverUrl: song?.al?.picUrl || song?.album?.picUrl || cached?.coverUrl,
            lyric: lyricText,
            aliases: song?.alia || cached?.aliases || []
        });
        res.json({ success: true, data: lyricText });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/detail', async (req, res) => {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ success: false, error: 'id is required' });
    try {
        const cover = await resolveCoverUrl(id);
        res.json({ success: true, data: { cover }});
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/me', async (req, res) => {
    try {
        const cookie = await getNeteaseCookie();
        const statusRes = await login_status({ cookie, timestamp: Date.now() } as any);
        const profile = (statusRes.body as any).data?.profile;
        if (!profile) return res.json({ success: false, error: 'Not logged in' });

        const plRes = await user_playlist({ uid: profile.userId, cookie, timestamp: Date.now() } as any);
        const playlists = (plRes.body as any).playlist || [];

        res.json({ success: true, data: { profile, playlists } });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/playlist/tracks', async (req, res) => {
    try {
        const id = req.query.id as string;
        if (!id) return res.status(400).json({ success: false, error: 'Playlist id required' });

        const cookie = await getNeteaseCookie();
        const trackRes = await playlist_track_all({ id, limit: 100, offset: 0, cookie, timestamp: Date.now() } as any);
        const songs = (trackRes.body as any).songs || [];
        
        const formatted = await Promise.all(songs.map(async (s: any) => {
            const durationMs = s.dt || 0;
            const minutes = Math.floor(durationMs / 60000);
            const seconds = Math.floor((durationMs % 60000) / 1000);
            const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            const cover = s.al?.picUrl || s.album?.picUrl || await resolveCoverUrl(String(s.id));
            await upsertNeteaseTrackCache({
                neteaseId: s.id.toString(),
                title: s.name,
                artist: s.ar?.[0]?.name || s.artists?.[0]?.name || 'Unknown',
                album: s.al?.name || s.album?.name || 'Unknown',
                durationMs,
                coverUrl: cover,
                aliases: s.alia || []
            });
            return standardizeSong('netease', s, s.name, s.ar?.[0]?.name || s.artists?.[0]?.name || 'Unknown', s.al?.name || s.album?.name || 'Unknown', durationStr, s.id.toString(), cover);
        }));

        res.json({ success: true, data: formatted });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/settings/cookie', async (req, res) => {
    const { cookie } = req.body;
    if (typeof cookie === 'string') {
        await setNeteaseCookie(cookie);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Invalid cookie' });
    }
});

router.get('/settings/cookie', async (req, res) => {
    const cookie = await getNeteaseCookie();
    res.json({ success: true, data: { cookie } });
});

router.get('/login/qr/key', async (req, res) => {
    try {
        const result = await login_qr_key({ timestamp: Date.now() } as any);
        res.json({ success: true, data: (result.body as any).data });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/login/qr/create', async (req, res) => {
    try {
        const key = req.query.key as string;
        if (!key) return res.status(400).json({ success: false, error: 'Key required' });
        const result = await login_qr_create({ key, qrimg: true, timestamp: Date.now() } as any);
        res.json({ success: true, data: (result.body as any).data });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/login/qr/check', async (req, res) => {
    try {
        const key = req.query.key as string;
        if (!key) return res.status(400).json({ success: false, error: 'Key required' });
        const result = await login_qr_check({ key, timestamp: Date.now() } as any);
        const body = result.body as any;
        if (body.code === 803) {
            await setNeteaseCookie(body.cookie || '');
        }
        res.json({ success: true, data: body });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/login/status', async (req, res) => {
    try {
        const cookie = await getNeteaseCookie();
        const result = await login_status({ cookie, timestamp: Date.now() } as any);
        res.json({ success: true, data: (result.body as any).data });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});


router.get('/downloaded', async (req, res) => {
    try {
        const dir = (req.query.dir || '') + '';
        const { dir: targetDir, tracks } = await listDownloadedTracks(dir);
        res.json({ success: true, data: tracks, dir: targetDir });
    } catch (e: any) {
        logger.error(`List downloaded tracks error: ${e?.message || String(e)}`, { module: 'Music' });
        res.status(500).json({ success: false, error: e?.message || 'Failed to read downloaded tracks' });
    }
});

router.get('/stream_local', (req, res) => {
    try {
        const filename = (req.query.filename || '') + '';
        const dir = resolveDownloadDir((req.query.dir || '') + '');
        if (!filename || !dir) return res.status(400).send('Missing params');
        if (path.basename(filename) !== filename) return res.status(400).send('Invalid filename');

        const rootDir = path.resolve(dir);
        const fullPath = path.resolve(rootDir, filename);
        if (!fullPath.startsWith(`${rootDir}${path.sep}`) && fullPath !== path.join(rootDir, filename)) {
            return res.status(400).send('Invalid path');
        }
        if (!fs.existsSync(fullPath)) return res.status(404).send('Not found');

        const stat = fs.statSync(fullPath);
        const fileSize = stat.size;
        const mimeType = getAudioMimeType(filename);
        const range = req.headers.range;

        if (range) {
            const [startValue, endValue] = range.replace(/bytes=/, '').split('-');
            const start = Number.parseInt(startValue, 10);
            const end = endValue ? Number.parseInt(endValue, 10) : fileSize - 1;

            if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= fileSize) {
                return res.status(416).send('Invalid range');
            }

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': end - start + 1,
                'Content-Type': mimeType
            });
            fs.createReadStream(fullPath, { start, end }).pipe(res);
            return;
        }

        res.writeHead(200, {
            'Accept-Ranges': 'bytes',
            'Content-Length': fileSize,
            'Content-Type': mimeType
        });
        fs.createReadStream(fullPath).pipe(res);
    } catch (e: any) {
        logger.error(`Stream local track error: ${e?.message || String(e)}`, { module: 'Music' });
        res.status(500).send(e?.message || 'Stream failed');
    }
});

router.post('/download', async (req, res) => {
    try {
        const { songId, title, artist, quality, dir } = req.body as {
            songId?: string;
            title?: string;
            artist?: string;
            quality?: string;
            dir?: string;
        };

        if (!songId || !title || !artist) {
            return res.status(400).json({ success: false, error: 'songId, title, artist are required' });
        }

        const resolvedQuality = quality || 'lossless';
        const url = await getNeteaseUrl(songId, resolvedQuality);
        if (!url) {
            return res.status(404).json({ success: false, error: 'URL not found or VIP required without valid cookie' });
        }

        const ext = url.split('.').pop()?.split('?')[0] || 'mp3';
        const filename = buildDownloadFilename(title, artist, ext);
        const targetDir = resolveDownloadDir(dir);
        const rpcData = await pushToAria2(url, filename, targetDir || undefined);

        if (rpcData.result) {
            await upsertDownloadMap({
                songId,
                filename,
                dir: targetDir,
                title,
                artist,
                quality: resolvedQuality,
                createdAt: new Date().toISOString()
            });
        }

        res.json({ success: Boolean(rpcData.result), data: rpcData, filename, dir: targetDir });
    } catch (e: any) {
        logger.error(`Push music download error: ${e?.message || String(e)}`, { module: 'Music' });
        res.status(500).json({ success: false, error: e?.message || 'Download push failed' });
    }
});

export default router;
