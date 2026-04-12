import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('downloads tasks endpoint returns grouped task counts', async () => {
  const originalFetch = global.fetch;

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    if (body.method === 'aria2.tellActive') {
      return { json: async () => ({ result: [{ gid: '1', status: 'active', totalLength: '100', completedLength: '20', downloadSpeed: '10', dir: '/downloads', files: [] }] }) } as Response;
    }
    if (body.method === 'aria2.tellWaiting') {
      return { json: async () => ({ result: [{ gid: '2', status: 'waiting', totalLength: '100', completedLength: '0', downloadSpeed: '0', dir: '/downloads', files: [] }] }) } as Response;
    }
    if (body.method === 'aria2.tellStopped') {
      return { json: async () => ({ result: [{ gid: '3', status: 'complete', totalLength: '100', completedLength: '100', downloadSpeed: '0', dir: '/downloads', files: [] }] }) } as Response;
    }
    throw new Error(`unexpected fetch: ${body.method}`);
  }) as typeof fetch;

  try {
    const { default: downloadsRoutes } = await import(`../src/routes/downloads?ts=${Date.now()}`);
    const app = express();
    app.use('/api/system/downloads', downloadsRoutes);

    const response = await request(app).get('/api/system/downloads/tasks');

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.available, true);
    assert.equal(response.body.data.tasks.length, 3);
    assert.equal(response.body.data.counts.all, 3);
    assert.equal(response.body.data.counts.active, 1);
    assert.equal(response.body.data.counts.waiting, 1);
    assert.equal(response.body.data.counts.completed, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('downloads cleanup removes only matching stopped tasks', async () => {
  const originalFetch = global.fetch;
  const removedGids: string[] = [];

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    if (body.method === 'aria2.tellStopped') {
      return {
        json: async () => ({
          result: [
            { gid: 'done-1', status: 'complete', totalLength: '10', completedLength: '10', downloadSpeed: '0', dir: '/downloads', files: [] },
            { gid: 'error-1', status: 'error', totalLength: '10', completedLength: '2', downloadSpeed: '0', dir: '/downloads', files: [] }
          ]
        })
      } as Response;
    }
    if (body.method === 'aria2.removeDownloadResult') {
      removedGids.push(body.params[1]);
      return { json: async () => ({ result: 'OK' }) } as Response;
    }
    throw new Error(`unexpected fetch: ${body.method}`);
  }) as typeof fetch;

  try {
    const { default: downloadsRoutes } = await import(`../src/routes/downloads?ts=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/system/downloads', downloadsRoutes);

    const response = await request(app)
      .post('/api/system/downloads/cleanup')
      .send({ scope: 'completed' });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.removedCount, 1);
    assert.deepEqual(removedGids, ['done-1']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('downloads create returns queue hint for magnet links', async () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.CLAWOS_ARIA2_SECRET;

  process.env.CLAWOS_ARIA2_SECRET = 'secure-aria2-secret';

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    if (body.method === 'aria2.addUri') {
      assert.equal(body.params[0], 'token:secure-aria2-secret');
      return { json: async () => ({ result: 'gid-123' }) } as Response;
    }
    throw new Error(`unexpected fetch: ${body.method}`);
  }) as typeof fetch;

  try {
    const { default: downloadsRoutes } = await import(`../src/routes/downloads?ts=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/system/downloads', downloadsRoutes);

    const response = await request(app)
      .post('/api/system/downloads/create')
      .send({ url: 'magnet:?xt=urn:btih:demo', dir: '/downloads' });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.gid, 'gid-123');
    assert.match(response.body.data.statusHint, /磁力元数据/);
  } finally {
    global.fetch = originalFetch;
    process.env.CLAWOS_ARIA2_SECRET = originalSecret;
  }
});

test('downloads config persists directory update', async () => {
  const originalFetch = global.fetch;
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-downloads-test-'));

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    if (body.method === 'aria2.changeGlobalOption') {
      return { json: async () => ({ result: 'OK' }) } as Response;
    }
    throw new Error(`unexpected fetch: ${body.method}`);
  }) as typeof fetch;

  try {
    process.env.HOME = tempHome;
    const { default: downloadsRoutes } = await import(`../src/routes/downloads?ts=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/system/downloads', downloadsRoutes);

    const response = await request(app)
      .post('/api/system/downloads/config')
      .send({ dir: '/data/downloads' });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const confPath = path.join(tempHome, '.aria2', 'aria2.conf');
    const confContent = await fs.readFile(confPath, 'utf8');
    assert.match(confContent, /dir=\/data\/downloads/);

    const configPath = path.join(tempHome, '.clawos', 'config.json');
    const configContent = JSON.parse(await fs.readFile(configPath, 'utf8'));
    assert.equal(configContent.paths.downloadsDir, '/data/downloads');
  } finally {
    global.fetch = originalFetch;
    process.env.HOME = originalHome;
  }
});
