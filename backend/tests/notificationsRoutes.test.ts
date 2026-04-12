import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

test('notifications routes support full CRUD lifecycle', async () => {
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-notifications-routes-'));
  process.env.HOME = tempHome;

  try {
    const { default: notificationsRoutes } = await import(`../src/routes/notifications?ts=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/system/notifications', notificationsRoutes);

    const createRes = await request(app)
      .post('/api/system/notifications')
      .send({ appId: 'dashboard', title: '系统提醒', message: '测试通知', level: 'info' });

    assert.equal(createRes.status, 200);
    assert.equal(createRes.body.success, true);
    assert.equal(createRes.body.data.appId, 'dashboard');
    const notificationId = createRes.body.data.id as string;
    assert.equal(typeof notificationId, 'string');

    const listRes = await request(app).get('/api/system/notifications?includeRead=true&limit=10');
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.success, true);
    assert.equal(Array.isArray(listRes.body.data), true);
    assert.equal(listRes.body.data.length, 1);

    const unreadRes = await request(app).get('/api/system/notifications/unread-count');
    assert.equal(unreadRes.status, 200);
    assert.equal(unreadRes.body.data.unreadCount, 1);

    const readRes = await request(app).post(`/api/system/notifications/${notificationId}/read`);
    assert.equal(readRes.status, 200);
    assert.equal(readRes.body.success, true);
    assert.equal(typeof readRes.body.data.readAt, 'string');

    const unreadAfterRead = await request(app).get('/api/system/notifications/unread-count');
    assert.equal(unreadAfterRead.status, 200);
    assert.equal(unreadAfterRead.body.data.unreadCount, 0);

    const createRes2 = await request(app)
      .post('/api/system/notifications')
      .send({ appId: 'notes', title: '新笔记', message: '你有一条新的笔记提醒' });
    assert.equal(createRes2.status, 200);

    const readAllRes = await request(app).post('/api/system/notifications/read-all');
    assert.equal(readAllRes.status, 200);
    assert.equal(readAllRes.body.success, true);
    assert.equal(typeof readAllRes.body.data.updatedCount, 'number');

    const deleteRes = await request(app).delete(`/api/system/notifications/${notificationId}`);
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.success, true);

    const clearRes = await request(app).delete('/api/system/notifications');
    assert.equal(clearRes.status, 200);
    assert.equal(clearRes.body.success, true);

    const listAfterClear = await request(app).get('/api/system/notifications?includeRead=true');
    assert.equal(listAfterClear.status, 200);
    assert.equal(listAfterClear.body.success, true);
    assert.equal(listAfterClear.body.data.length, 0);
  } finally {
    process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});

test('notifications routes validate payload', async () => {
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-notifications-validate-'));
  process.env.HOME = tempHome;

  try {
    const { default: notificationsRoutes } = await import(`../src/routes/notifications?ts=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/system/notifications', notificationsRoutes);

    const badRes = await request(app)
      .post('/api/system/notifications')
      .send({ appId: '', title: 'x', message: 'y' });
    assert.equal(badRes.status, 400);
    assert.equal(badRes.body.success, false);

    const badLevelRes = await request(app)
      .post('/api/system/notifications')
      .send({ appId: 'dashboard', title: 'x', message: 'y', level: 'fatal' });
    assert.equal(badLevelRes.status, 400);
    assert.equal(badLevelRes.body.success, false);
  } finally {
    process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});
