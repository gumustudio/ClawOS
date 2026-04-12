import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';

test('filebrowser proxy accepts dedicated auth cookie path', async () => {
  const serverSource = await fs.readFile(new URL('../src/server.ts', import.meta.url), 'utf8');

  assert.match(serverSource, /FILEBROWSER_AUTH_COOKIE = 'clawos_filebrowser_auth'/);
  assert.match(serverSource, /function hasValidFileBrowserCookie/);
  assert.match(serverSource, /function isFileBrowserProxyRequest/);
  assert.match(serverSource, /isFileBrowserProxyRequest\(req\) && hasValidFileBrowserCookie\(req\)/);
  assert.match(serverSource, /res\.setHeader\('Set-Cookie', buildFileBrowserAuthCookie\(req\)\)/);
});
