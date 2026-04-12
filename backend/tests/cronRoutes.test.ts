import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('cron routes validate schedule and persist CRUD changes', async () => {
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-cron-test-'));

  process.env.HOME = tempHome;

  try {
    const { default: cronRoutes, initCronJobs } = await import(`../src/routes/cron?ts=${Date.now()}`);
    await initCronJobs();

    const app = express();
    app.use(express.json());
    app.use('/api/system/cron', cronRoutes);

    const invalidResponse = await request(app)
      .post('/api/system/cron')
      .send({ name: 'Bad Job', schedule: 'not-a-cron', command: 'echo test' });

    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidResponse.body.success, false);

    const createResponse = await request(app)
      .post('/api/system/cron')
      .send({ name: 'Demo Job', schedule: '*/5 * * * *', command: 'echo test', enabled: true });

    assert.equal(createResponse.status, 200);
    assert.equal(createResponse.body.success, true);
    assert.equal(createResponse.body.data.name, 'Demo Job');

    const jobId = String(createResponse.body.data.id);

    const listResponse = await request(app).get('/api/system/cron');
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.body.data.length, 1);

    const updateResponse = await request(app)
      .put(`/api/system/cron/${jobId}`)
      .send({ enabled: false, schedule: '0 12 * * *' });

    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.body.success, true);
    assert.equal(updateResponse.body.data.enabled, false);
    assert.equal(updateResponse.body.data.schedule, '0 12 * * *');

    const runMissingResponse = await request(app).post('/api/system/cron/missing-job/run');
    assert.equal(runMissingResponse.status, 404);

    const deleteResponse = await request(app).delete(`/api/system/cron/${jobId}`);
    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteResponse.body.success, true);

    const cronFile = path.join(tempHome, '.clawos', 'cron_jobs.json');
    const savedJobs = JSON.parse(await fs.readFile(cronFile, 'utf-8')) as unknown[];
    assert.equal(savedJobs.length, 0);
  } finally {
    process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});
