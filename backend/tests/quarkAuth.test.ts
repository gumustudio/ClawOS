import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

test('quark auth session persists merged cookies', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-quark-auth-'));
  process.env.HOME = tempHome;

  const { clearQuarkAuthSession, readQuarkAuthSession, updateQuarkAuthSession } = await import(`../src/utils/quarkAuth?ts=${Date.now()}`);

  await clearQuarkAuthSession();
  await updateQuarkAuthSession(['foo=bar; Path=/; HttpOnly', 'sid=123; Path=/']);
  await updateQuarkAuthSession(['foo=baz; Path=/']);

  const session = await readQuarkAuthSession();

  assert.ok(session);
  assert.equal(session?.cookies.foo, 'baz');
  assert.equal(session?.cookies.sid, '123');
  assert.match(session?.cookieHeader || '', /foo=baz/);
  assert.match(session?.cookieHeader || '', /sid=123/);
});

test('quark auth session exposes cached session synchronously after write', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-quark-auth-cache-'));
  process.env.HOME = tempHome;

  const { clearQuarkAuthSession, getCachedQuarkAuthSession, updateQuarkAuthSession } = await import(`../src/utils/quarkAuth?ts=${Date.now()}`);

  await clearQuarkAuthSession();
  await updateQuarkAuthSession(['sid=456; Path=/']);

  const cached = getCachedQuarkAuthSession();
  assert.ok(cached);
  assert.equal(cached?.cookies.sid, '456');
});
