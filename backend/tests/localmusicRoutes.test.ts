import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function waitForFile(filePath: string, attempts = 20, delayMs = 25) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      await fs.access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`Timed out waiting for file: ${filePath}`);
}

test('localmusic list returns needsScan when scanned dir mismatches request dir', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-localmusic-test-'));
  process.env.HOME = tempHome;

  const cacheDir = path.join(tempHome, '.clawos', 'music_cache');
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(path.join(cacheDir, 'db.json'), JSON.stringify({
    scannedDir: '/music/a',
    tracks: [{
      id: '1',
      path: '/music/a/demo.mp3',
      name: 'demo',
      artist: 'artist',
      album: 'album',
      duration: 10,
      hasCover: false,
      hasLocalLrc: false,
      neteaseSearched: false,
      cachedLyric: false,
      warmupAttempts: 0,
      warmupFailed: false
    }]
  }), 'utf8');

  const { default: localmusicRoutes } = await import(`../src/routes/localmusic?ts=${Date.now()}`);
  const app = express();
  app.use('/api/system/localmusic', localmusicRoutes);

  const response = await request(app)
    .get('/api/system/localmusic/list')
    .set('x-music-dir', encodeURIComponent('/music/b'));

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.needsScan, true);
  assert.deepEqual(response.body.data, []);
});

test('warmup-status endpoint returns status payload', async () => {
  const { default: localmusicRoutes } = await import(`../src/routes/localmusic?ts=${Date.now()}`);
  const app = express();
  app.use('/api/system/localmusic', localmusicRoutes);

  const response = await request(app).get('/api/system/localmusic/warmup-status');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(typeof response.body.data.running === 'boolean');
  assert.ok(typeof response.body.data.total === 'number');
});

test('localmusic list backfills netease track cache from scanned DB entries', async () => {
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-localmusic-cache-test-'));
  process.env.HOME = tempHome;

  try {
    const cacheDir = path.join(tempHome, '.clawos', 'music_cache');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, 'db.json'), JSON.stringify({
      scannedDir: '/music/a',
      tracks: [{
        id: 'track-1',
        path: '/music/a/demo.mp3',
        name: '演示歌曲',
        artist: '演示歌手',
        album: '演示专辑',
        duration: 10,
        hasCover: false,
        hasLocalLrc: false,
        neteaseId: 123456,
        neteaseSearched: true,
        cachedLyric: false,
        warmupAttempts: 1,
        warmupFailed: false
      }]
    }), 'utf8');

    const { default: localmusicRoutes } = await import(`../src/routes/localmusic?ts=${Date.now()}`);
    const app = express();
    app.use('/api/system/localmusic', localmusicRoutes);

    const response = await request(app)
      .get('/api/system/localmusic/list')
      .set('x-music-dir', encodeURIComponent('/music/a'));

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.length, 1);

    const trackCachePath = path.join(cacheDir, 'netease_tracks.json');
    await waitForFile(trackCachePath);
    const trackCache = JSON.parse(await fs.readFile(trackCachePath, 'utf8'));
    assert.equal(trackCache.length, 1);
    assert.equal(trackCache[0].neteaseId, '123456');
    assert.equal(trackCache[0].title, '演示歌曲');
    assert.equal(trackCache[0].artist, '演示歌手');
    assert.equal(trackCache[0].album, '演示专辑');
  } finally {
    process.env.HOME = originalHome;
  }
});

test('scan clears stale hasCover when cached cover file is missing', async () => {
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-localmusic-scan-test-'));
  process.env.HOME = tempHome;

  try {
    const musicDir = path.join(tempHome, 'music');
    const cacheDir = path.join(tempHome, '.clawos', 'music_cache');
    await fs.mkdir(musicDir, { recursive: true });
    await fs.mkdir(cacheDir, { recursive: true });

    const songPath = path.join(musicDir, 'demo.mp3');
    const songId = crypto.createHash('md5').update(songPath).digest('hex');
    await fs.writeFile(songPath, 'demo', 'utf8');

    await fs.writeFile(path.join(cacheDir, 'db.json'), JSON.stringify({
      scannedDir: musicDir,
      tracks: [{
        id: songId,
        path: songPath,
        name: '演示歌曲',
        artist: '演示歌手',
        album: '演示专辑',
        duration: 10,
        hasCover: true,
        hasLocalLrc: false,
        neteaseSearched: true,
        cachedLyric: false,
        warmupAttempts: 1,
        warmupFailed: false
      }]
    }), 'utf8');

    const { default: localmusicRoutes } = await import(`../src/routes/localmusic?ts=${Date.now()}`);
    const app = express();
    app.use('/api/system/localmusic', localmusicRoutes);

    const response = await request(app)
      .post('/api/system/localmusic/scan')
      .set('x-music-dir', encodeURIComponent(musicDir));

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].hasCover, false);

    const persisted = JSON.parse(await fs.readFile(path.join(cacheDir, 'db.json'), 'utf8'));
    assert.equal(persisted.tracks[0].hasCover, false);
  } finally {
    process.env.HOME = originalHome;
  }
});

test('scan and list reuse cached netease metadata and persist lyric cache', async () => {
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-localmusic-chain-test-'));
  process.env.HOME = tempHome;

  try {
    const musicDir = path.join(tempHome, 'music');
    const cacheDir = path.join(tempHome, '.clawos', 'music_cache');
    await fs.mkdir(musicDir, { recursive: true });
    await fs.mkdir(cacheDir, { recursive: true });

    const songPath = path.join(musicDir, '送情郎 - 岳云鹏.mp3');
    const songId = crypto.createHash('md5').update(songPath).digest('hex');
    await fs.writeFile(songPath, 'demo', 'utf8');

    await fs.writeFile(path.join(cacheDir, 'db.json'), JSON.stringify({
      scannedDir: musicDir,
      tracks: [{
        id: songId,
        path: songPath,
        name: '送情郎 - 岳云鹏',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        duration: 0,
        hasCover: false,
        hasLocalLrc: false,
        neteaseSearched: true,
        cachedLyric: false,
        warmupAttempts: 1,
        warmupFailed: false
      }]
    }), 'utf8');

    await fs.writeFile(path.join(cacheDir, 'netease_tracks.json'), JSON.stringify([{
      neteaseId: '459720276',
      title: '送情郎',
      artist: '岳云鹏',
      album: '测试专辑',
      lyric: '[00:01.00]测试歌词',
      aliases: [],
      matchKeys: ['送情郎岳云鹏', '送情郎'],
      updatedAt: new Date().toISOString()
    }], null, 2), 'utf8');

    const { default: localmusicRoutes } = await import(`../src/routes/localmusic?ts=${Date.now()}`);
    const app = express();
    app.use('/api/system/localmusic', localmusicRoutes);

    const scanResponse = await request(app)
      .post('/api/system/localmusic/scan')
      .set('x-music-dir', encodeURIComponent(musicDir));

    assert.equal(scanResponse.status, 200);
    assert.equal(scanResponse.body.success, true);
    assert.equal(scanResponse.body.data.length, 1);
    assert.equal(scanResponse.body.data[0].artist, '岳云鹏');
    assert.equal(scanResponse.body.data[0].album, '测试专辑');
    assert.equal(scanResponse.body.data[0].neteaseId, 459720276);
    assert.equal(scanResponse.body.data[0].cachedLyric, true);
    assert.equal(scanResponse.body.data[0].metadataSource, 'netease-cache');

    const lyricPath = path.join(cacheDir, `${songId}.lrc`);
    await waitForFile(lyricPath);
    assert.equal(await fs.readFile(lyricPath, 'utf8'), '[00:01.00]测试歌词');

    const persisted = JSON.parse(await fs.readFile(path.join(cacheDir, 'db.json'), 'utf8'));
    assert.equal(persisted.tracks[0].artist, '岳云鹏');
    assert.equal(persisted.tracks[0].album, '测试专辑');
    assert.equal(persisted.tracks[0].cachedLyric, true);

    const listResponse = await request(app)
      .get('/api/system/localmusic/list')
      .set('x-music-dir', encodeURIComponent(musicDir));

    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.body.success, true);
    assert.equal(listResponse.body.data.length, 1);
    assert.equal(listResponse.body.data[0].artist, '岳云鹏');
    assert.equal(listResponse.body.data[0].album, '测试专辑');
    assert.equal(listResponse.body.data[0].cachedLyric, true);
  } finally {
    process.env.HOME = originalHome;
  }
});

test('cover endpoint serves files from hidden cache directory', async () => {
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-localmusic-cover-test-'));
  process.env.HOME = tempHome;

  try {
    const cacheDir = path.join(tempHome, '.clawos', 'music_cache');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, 'cover-demo.jpg'), 'cover-bytes', 'utf8');

    const { default: localmusicRoutes } = await import(`../src/routes/localmusic?ts=${Date.now()}`);
    const app = express();
    app.use('/api/system/localmusic', localmusicRoutes);

    const response = await request(app).get('/api/system/localmusic/cover/cover-demo');

    assert.equal(response.status, 200);
    assert.equal(response.headers['content-length'], String(Buffer.byteLength('cover-bytes')));
    assert.deepEqual(Buffer.from(response.body).toString('utf8'), 'cover-bytes');
  } finally {
    process.env.HOME = originalHome;
  }
});
