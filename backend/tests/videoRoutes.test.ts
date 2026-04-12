import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

test('video latest maps source payload into ClawOS response shape', async () => {
  const originalFetch = global.fetch;

  global.fetch = (async () => ({
    json: async () => ({
      list: [
        {
          vod_id: '123',
          vod_name: '示例影片',
          vod_pic: 'https://example.com/poster.jpg',
          vod_year: '2026',
          vod_area: '中国',
          vod_remarks: '更新至 10 集',
          type_name: '剧情',
          vod_blurb: '简介',
          vod_content: '详情',
          vod_play_url: '第1集$https://example.com/1.m3u8'
        }
      ]
    })
  } as Response)) as typeof fetch;

  try {
    const { default: videoRoutes } = await import(`../src/routes/video?ts=${Date.now()}`);
    const app = express();
    app.use('/api/system/video', videoRoutes);

    const response = await request(app).get('/api/system/video/latest?page=1');

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].id, '123');
    assert.equal(response.body.data[0].sourceId, 'ffzy');
    assert.equal(response.body.data[0].name, '示例影片');
  } finally {
    global.fetch = originalFetch;
  }
});

test('video search rejects invalid source id', async () => {
  const { default: videoRoutes } = await import(`../src/routes/video?ts=${Date.now()}`);
  const app = express();
  app.use('/api/system/video', videoRoutes);

  const response = await request(app).get('/api/system/video/search?keyword=test&source=invalid');

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.match(response.body.error, /Invalid source/);
});
