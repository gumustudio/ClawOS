import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';

test('quark proxy server injects local request rewrite script', async () => {
  const serverSource = await fs.readFile(new URL('../src/server.ts', import.meta.url), 'utf8');

  assert.match(serverSource, /proxy\/quark-auth-uop/);
  assert.match(serverSource, /https:\/\/uop\.quark\.cn\//);
  assert.match(serverSource, /XMLHttpRequest\.prototype\.open/);
  assert.match(serverSource, /window\.fetch/);
});
