import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

test('netdisk status reports not_mounted when target path is missing', async () => {
  const originalFetch = global.fetch;

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/api/auth/login')) {
      return {
        json: async () => ({ code: 200, data: { token: 'token-123' } })
      } as Response;
    }

    if (url.endsWith('/api/fs/list')) {
      return {
        json: async () => ({ code: 500, message: 'object not found' })
      } as Response;
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const { default: netdiskRoutes } = await import(`../src/routes/netdisk?ts=${Date.now()}`);
    const app = express();
    app.use('/api/system/netdisk', netdiskRoutes);

    const response = await request(app).get('/api/system/netdisk/status?brand=baidu');

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.brand, 'baidu');
    assert.equal(response.body.data.mounted, false);
    assert.equal(response.body.data.status, 'not_mounted');
  } finally {
    global.fetch = originalFetch;
  }
});

test('netdisk status reports mounted when target path exists', async () => {
  const originalFetch = global.fetch;
  const originalPassword = process.env.CLAWOS_ALIST_ADMIN_PASSWORD;

  process.env.CLAWOS_ALIST_ADMIN_PASSWORD = 'secure-password';

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/api/auth/login')) {
      return {
        json: async () => ({ code: 200, data: { token: 'token-123' } })
      } as Response;
    }

    if (url.endsWith('/api/fs/list')) {
      return {
        json: async () => ({ code: 200, data: { content: [{ name: 'demo.txt' }] } })
      } as Response;
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const { default: netdiskRoutes } = await import(`../src/routes/netdisk?ts=${Date.now()}`);
    const app = express();
    app.use('/api/system/netdisk', netdiskRoutes);

    const response = await request(app).get('/api/system/netdisk/status?brand=quark');

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.brand, 'quark');
    assert.equal(response.body.data.mounted, true);
    assert.equal(response.body.data.status, 'mounted');
    assert.equal(response.body.data.itemCount, 1);
    assert.equal(response.body.data.alistAdmin.password, 'secure-password');
    assert.equal(response.body.data.localOnlyAdmin, true);
  } finally {
    global.fetch = originalFetch;
    process.env.CLAWOS_ALIST_ADMIN_PASSWORD = originalPassword;
  }
});

test('netdisk configure validates required credential field by brand', async () => {
  const { default: netdiskRoutes } = await import(`../src/routes/netdisk?ts=${Date.now()}`);
  const app = express();
  app.use(express.json());
  app.use('/api/system/netdisk', netdiskRoutes);

  const baiduResponse = await request(app)
    .post('/api/system/netdisk/configure')
    .send({ brand: 'baidu', refreshToken: '' });

  const quarkResponse = await request(app)
    .post('/api/system/netdisk/configure')
    .send({ brand: 'quark', cookie: '' });

  assert.equal(baiduResponse.status, 400);
  assert.equal(baiduResponse.body.success, false);
  assert.match(baiduResponse.body.error, /refresh_token/);

  assert.equal(quarkResponse.status, 400);
  assert.equal(quarkResponse.body.success, false);
  assert.match(quarkResponse.body.error, /cookie/);
});

test('netdisk configure stores driver credentials inside AList addition payload', async () => {
  const originalFetch = global.fetch;
  const calls: Array<{ url: string; body?: string }> = [];

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });

    if (url.endsWith('/api/auth/login')) {
      return {
        json: async () => ({ code: 200, data: { token: 'token-123' } })
      } as Response;
    }

    if (url.endsWith('/api/admin/storage/list?page=1&per_page=200')) {
      return {
        json: async () => ({ code: 200, data: { content: [] } })
      } as Response;
    }

    if (url.endsWith('/api/admin/storage/create')) {
      return {
        json: async () => ({ code: 200, message: 'success', data: { id: 7 } })
      } as Response;
    }

    if (url.endsWith('/api/fs/list')) {
      return {
        json: async () => ({ code: 200, data: { content: [{ name: 'demo.txt' }] } })
      } as Response;
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const { default: netdiskRoutes } = await import(`../src/routes/netdisk?ts=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/system/netdisk', netdiskRoutes);

    const response = await request(app)
      .post('/api/system/netdisk/configure')
      .send({ brand: 'quark', cookie: 'sid=abc123' });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const createCall = calls.find((call) => call.url.endsWith('/api/admin/storage/create'));
    assert.ok(createCall?.body);

    const payload = JSON.parse(createCall.body || '{}');
    assert.equal(payload.driver, 'Quark');
    assert.equal(payload.mount_path, '/quark');
    assert.equal(typeof payload.addition, 'string');

    const addition = JSON.parse(payload.addition);
    assert.equal(addition.cookie, 'sid=abc123');
    assert.equal(addition.root_folder_id, '0');
  } finally {
    global.fetch = originalFetch;
  }
});

test('netdisk download pushes AList raw url into aria2 with env secret', async () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.CLAWOS_ARIA2_SECRET;
  const calls: Array<{ url: string; body?: string }> = [];

  process.env.CLAWOS_ARIA2_SECRET = 'secure-aria2-secret';

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });

    if (url.endsWith('/api/auth/login')) {
      return {
        json: async () => ({ code: 200, data: { token: 'token-123' } })
      } as Response;
    }

    if (url.endsWith('/api/fs/get')) {
      return {
        json: async () => ({ code: 200, data: { raw_url: 'https://download.example.com/file.mp4' } })
      } as Response;
    }

    if (url.endsWith('/jsonrpc')) {
      return {
        json: async () => ({ result: 'gid-123' })
      } as Response;
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const { default: netdiskRoutes } = await import(`../src/routes/netdisk?ts=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/system/netdisk', netdiskRoutes);

    const response = await request(app)
      .post('/api/system/netdisk/download')
      .send({ path: '/quark/demo.mp4' });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const aria2Call = calls.find((call) => call.url.endsWith('/jsonrpc'));
    assert.ok(aria2Call?.body);

    const payload = JSON.parse(aria2Call.body || '{}');
    assert.equal(payload.method, 'aria2.addUri');
    assert.equal(payload.params[0], 'token:secure-aria2-secret');
    assert.deepEqual(payload.params[1], ['https://download.example.com/file.mp4']);
  } finally {
    global.fetch = originalFetch;
    process.env.CLAWOS_ARIA2_SECRET = originalSecret;
  }
});
