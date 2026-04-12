import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('config paths endpoint returns server-side default paths', async () => {
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-config-paths-'));

  process.env.HOME = tempHome;

  try {
    const { default: configRoutes } = await import(`../src/routes/config?ts=${Date.now()}`);
    const app = express();
    app.use('/api/system/config', configRoutes);

    const response = await request(app).get('/api/system/config/paths');

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.downloadsDir, path.join(tempHome, '下载'));
    assert.equal(response.body.data.musicDownloadsDir, path.join(tempHome, '音乐'));
    assert.equal(response.body.data.localMusicDir, path.join(tempHome, '音乐'));
    assert.equal(response.body.data.notesDir, path.join(tempHome, '文档', '随手小记'));
    assert.equal(response.body.data.readerDir, path.join(tempHome, '文档', 'RSS资讯'));
    assert.equal(response.body.data.videoDownloadsDir, path.join(tempHome, '视频'));
  } finally {
    process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});

test('config ui endpoint returns default ui config and persists updates', async () => {
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-config-ui-'));

  process.env.HOME = tempHome;

  try {
    const { default: configRoutes } = await import(`../src/routes/config?ts=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/system/config', configRoutes);

    const initialResponse = await request(app).get('/api/system/config/ui');

    assert.equal(initialResponse.status, 200);
    assert.equal(initialResponse.body.success, true);
    assert.equal(initialResponse.body.data.dockSize, 48);
    assert.equal(initialResponse.body.data.autoHideDock, false);
    assert.equal(initialResponse.body.data.defaultFullscreen, false);
    assert.equal(initialResponse.body.data.showWidgets, true);
    assert.equal(initialResponse.body.data.dockHideDelay, 2);
    assert.equal(initialResponse.body.data.musicQuality, 'lossless');
    assert.equal(initialResponse.body.data.quickNote, '');

    const updateResponse = await request(app)
      .post('/api/system/config/ui')
      .send({
        dockSize: 64,
        autoHideDock: true,
        wallpaper: 'https://example.com/wallpaper.jpg',
        musicQuality: 'hires',
        quickNote: 'server-side note'
      });

    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.body.success, true);
    assert.equal(updateResponse.body.data.dockSize, 64);
    assert.equal(updateResponse.body.data.autoHideDock, true);
    assert.equal(updateResponse.body.data.wallpaper, 'https://example.com/wallpaper.jpg');
    assert.equal(updateResponse.body.data.musicQuality, 'hires');
    assert.equal(updateResponse.body.data.quickNote, 'server-side note');
    assert.equal(updateResponse.body.data.showWidgets, true);

    const configFile = path.join(tempHome, '.clawos', 'config.json');
    const saved = JSON.parse(await fs.readFile(configFile, 'utf-8')) as { ui?: { quickNote?: string } };
    assert.equal(saved.ui?.quickNote, 'server-side note');
  } finally {
    process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});
