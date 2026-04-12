import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('downloaded endpoint scans recursively and returns nested audio files', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-music-test-'));
  process.env.HOME = tempHome;

  const ariaDir = path.join(tempHome, 'downloads');
  const nestedDir = path.join(ariaDir, 'nested');
  await fs.mkdir(nestedDir, { recursive: true });
  await fs.writeFile(path.join(tempHome, '.aria2', 'aria2.conf'), `dir=${ariaDir}`, 'utf8').catch(async () => {
    await fs.mkdir(path.join(tempHome, '.aria2'), { recursive: true });
    await fs.writeFile(path.join(tempHome, '.aria2', 'aria2.conf'), `dir=${ariaDir}`, 'utf8');
  });
  await fs.writeFile(path.join(nestedDir, 'song.mp3'), 'demo', 'utf8');
  await fs.writeFile(path.join(nestedDir, 'cover.jpg'), 'skip', 'utf8');

  const { default: musicRoutes } = await import(`../src/routes/music?ts=${Date.now()}`);
  const app = express();
  app.use(express.json());
  app.use('/api/system/music', musicRoutes);

  const response = await request(app).get('/api/system/music/downloaded');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.dir, ariaDir);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].filename, 'nested/song.mp3');
});

test('music settings cookie persists to server-side storage and survives module reload', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-music-cookie-'));
  const originalHome = process.env.HOME;

  process.env.HOME = tempHome;

  try {
    const firstImport = await import(`../src/routes/music?ts=${Date.now()}`);
    const firstApp = express();
    firstApp.use(express.json());
    firstApp.use('/api/system/music', firstImport.default);

    const saveResponse = await request(firstApp)
      .post('/api/system/music/settings/cookie')
      .send({ cookie: 'MUSIC_U=server-side-cookie' });

    assert.equal(saveResponse.status, 200);
    assert.equal(saveResponse.body.success, true);

    const cookieFile = path.join(tempHome, '.clawos', 'music_cache', 'netease-cookie.json');
    const persisted = JSON.parse(await fs.readFile(cookieFile, 'utf8'));
    assert.equal(persisted.cookie, 'MUSIC_U=server-side-cookie');

    const secondImport = await import(`../src/routes/music?ts=${Date.now() + 1}`);
    const secondApp = express();
    secondApp.use(express.json());
    secondApp.use('/api/system/music', secondImport.default);

    const readResponse = await request(secondApp).get('/api/system/music/settings/cookie');

    assert.equal(readResponse.status, 200);
    assert.equal(readResponse.body.success, true);
    assert.equal(readResponse.body.data.cookie, 'MUSIC_U=server-side-cookie');
  } finally {
    process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});

test('music settings cookie trims whitespace before persistence', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-music-qr-cookie-'));
  const originalHome = process.env.HOME;

  process.env.HOME = tempHome;

  try {
    const musicModule = await import(`../src/routes/music?ts=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/system/music', musicModule.default);

    const response = await request(app)
      .post('/api/system/music/settings/cookie')
      .send({ cookie: '  MUSIC_U=trimmed-cookie  ' });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const cookieFile = path.join(tempHome, '.clawos', 'music_cache', 'netease-cookie.json');
    const persisted = JSON.parse(await fs.readFile(cookieFile, 'utf8'));
    assert.equal(persisted.cookie, 'MUSIC_U=trimmed-cookie');
  } finally {
    process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});

test('music settings cookie rejects invalid payload type', async () => {
  const { default: musicRoutes } = await import(`../src/routes/music?ts=${Date.now()}`);
  const app = express();
  app.use(express.json());
  app.use('/api/system/music', musicRoutes);

  const response = await request(app)
    .post('/api/system/music/settings/cookie')
    .send({ cookie: { invalid: true } });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.match(response.body.error, /Invalid cookie/);
});
