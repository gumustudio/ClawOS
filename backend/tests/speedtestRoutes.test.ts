import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

test('speedtest download returns requested binary payload headers', async () => {
  const { default: speedtestRoutes } = await import(`../src/routes/speedtest?ts=${Date.now()}`);
  const app = express();
  app.use('/api/system/speedtest', speedtestRoutes);

  const response = await request(app)
    .get('/api/system/speedtest/download?size=1')
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'application/octet-stream');
  assert.equal(response.headers['content-length'], String(1024 * 1024));
  assert.equal((response.body as Buffer).length, 1024 * 1024);
});

test('speedtest upload consumes request body and responds success', async () => {
  const { default: speedtestRoutes } = await import(`../src/routes/speedtest?ts=${Date.now()}`);
  const app = express();
  app.use('/api/system/speedtest', speedtestRoutes);

  const response = await request(app)
    .post('/api/system/speedtest/upload')
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from('upload-payload'));

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
});
