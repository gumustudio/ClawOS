import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';

test('openclaw proxy keeps unified prefix rewrite without password bridge injection', async () => {
  const serverSource = await fs.readFile(new URL('../src/server.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(serverSource, /password-bridge\.js/);
  assert.match(serverSource, /function resolveOpenClawGatewayToken/);
  assert.match(serverSource, /OPENCLAW_TRUSTED_PROXY_USER = 'clawos'/);
  assert.match(serverSource, /function setTrustedProxyIdentityHeaders/);
  assert.match(serverSource, /headers\.setHeader\('x-forwarded-user', OPENCLAW_TRUSTED_PROXY_USER\)/);
  assert.match(serverSource, /OPENCLAW_GATEWAY_TOKEN/);
  assert.match(serverSource, /\/api\/system\/openclaw\/bootstrap/);
  assert.match(serverSource, /xfwd: true/);
  assert.match(serverSource, /res\.removeHeader\('x-frame-options'\)/);
  assert.match(serverSource, /res\.setHeader\(\s*'content-security-policy'/);
  assert.match(serverSource, /rewriteProxyPrefix\(rewriteProxyPrefix\(requestPath, '\/clawos\/proxy\/openclaw'\), '\/proxy\/openclaw'\)/);
  assert.match(serverSource, /Accepted ClawOS OpenClaw WebSocket upgrade/);
});
