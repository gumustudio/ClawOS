import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';

test('getDirectoryBackupStatus returns latest backup by modified time', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-backup-probe-'));
  const olderFile = path.join(tempDir, 'backup-old.zip');
  const newerFile = path.join(tempDir, 'backup-new.zip');

  await fs.writeFile(olderFile, 'old');
  await fs.writeFile(newerFile, 'new');
  await fs.utimes(olderFile, new Date('2026-03-28T10:00:00.000Z'), new Date('2026-03-28T10:00:00.000Z'));
  await fs.utimes(newerFile, new Date('2026-03-29T10:00:00.000Z'), new Date('2026-03-29T10:00:00.000Z'));

  try {
    const { getDirectoryBackupStatus } = await import(`../src/utils/probe?ts=${Date.now()}`);
    const status = await getDirectoryBackupStatus(tempDir);

    assert.equal(status.latest, 'backup-new.zip');
    assert.equal(status.latestName, 'backup-new.zip');
    assert.equal(status.count, 2);
    assert.equal(status.timestamp, '2026-03-29T10:00:00.000Z');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('getDirectoryBackupStatus reports missing backup directory', async () => {
  const missingDir = path.join(os.tmpdir(), `clawos-missing-backup-${Date.now()}`);
  const { getDirectoryBackupStatus } = await import(`../src/utils/probe?ts=${Date.now()}`);
  const status = await getDirectoryBackupStatus(missingDir);

  assert.equal(status.latest, null);
  assert.equal(status.count, 0);
  assert.equal(status.error, '备份目录不存在');
});

test('getOpenClawBackupStatus separates versions and zips directories', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-openclaw-home-'));
  const backupRoot = path.join(tempHome, 'OpenCLawSpace', 'ClawBackUp');
  const versionsDir = path.join(backupRoot, 'versions');
  const zipsDir = path.join(backupRoot, 'zips');
  const oldHome = process.env.HOME;

  await fs.mkdir(versionsDir, { recursive: true });
  await fs.mkdir(zipsDir, { recursive: true });
  await fs.writeFile(path.join(backupRoot, 'VERSIONS.md'), '# index\n\n| 版本号 | 日期 | 时间 | 时间戳 | 技能数 | 备注 |\n|--------|------|------|--------|--------|------|\n| v1.1 | 2026-03-26 | 23-32-52 | 233252 | 2 | 自动备份 |\n');

  const versionEntry = path.join(versionsDir, 'v1.1-2026-03-26-233252');
  const zipEntry = path.join(zipsDir, 'v1.1-2026-03-26-233252.zip');
  await fs.mkdir(versionEntry, { recursive: true });
  await fs.writeFile(zipEntry, 'zip');
  await fs.utimes(versionEntry, new Date('2026-03-29T09:00:00.000Z'), new Date('2026-03-29T09:00:00.000Z'));
  await fs.utimes(zipEntry, new Date('2026-03-29T10:00:00.000Z'), new Date('2026-03-29T10:00:00.000Z'));

  process.env.HOME = tempHome;

  try {
    const { getOpenClawBackupStatus } = await import(`../src/utils/probe?ts=${Date.now()}`);
    const status = await getOpenClawBackupStatus();

    assert.equal(status.hasIndexFile, true);
    assert.equal(status.latestIndexedVersion, 'v1.1');
    assert.equal(status.latestIndexedStamp, '233252');
    assert.equal(status.versions.latest, 'v1.1-2026-03-26-233252');
    assert.equal(status.versions.count, 1);
    assert.equal(status.zips.latest, 'v1.1-2026-03-26-233252.zip');
    assert.equal(status.zips.count, 1);
    assert.equal(status.syncStatus, 'ok');
  } finally {
    process.env.HOME = oldHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});

test('getOpenClawBackupStatus reports warning when index and backups diverge', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-openclaw-drift-'));
  const backupRoot = path.join(tempHome, 'OpenCLawSpace', 'ClawBackUp');
  const versionsDir = path.join(backupRoot, 'versions');
  const zipsDir = path.join(backupRoot, 'zips');
  const oldHome = process.env.HOME;

  await fs.mkdir(versionsDir, { recursive: true });
  await fs.mkdir(zipsDir, { recursive: true });
  await fs.writeFile(path.join(backupRoot, 'VERSIONS.md'), '# index\n\n| 版本号 | 日期 | 时间 | 时间戳 | 技能数 | 备注 |\n|--------|------|------|--------|--------|------|\n| v1.1 | 2026-03-26 | 23-32-52 | 233252 | 2 | 自动备份 |\n');

  const versionEntry = path.join(versionsDir, 'v1.2-2026-03-27-010101');
  const zipEntry = path.join(zipsDir, 'v1.2-2026-03-27-010101.zip');
  await fs.mkdir(versionEntry, { recursive: true });
  await fs.writeFile(zipEntry, 'zip');
  await fs.utimes(versionEntry, new Date('2026-03-29T09:00:00.000Z'), new Date('2026-03-29T09:00:00.000Z'));
  await fs.utimes(zipEntry, new Date('2026-03-29T10:00:00.000Z'), new Date('2026-03-29T10:00:00.000Z'));

  process.env.HOME = tempHome;

  try {
    const { getOpenClawBackupStatus } = await import(`../src/utils/probe?ts=${Date.now()}`);
    const status = await getOpenClawBackupStatus();

    assert.equal(status.syncStatus, 'warning');
    assert.equal(status.syncMessage, 'VERSIONS.md 最新索引与实际最新备份不一致');
  } finally {
    process.env.HOME = oldHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});

test('getResticBackupStatus reports local snapshots and readonly config state', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-restic-home-'));
  const backupRoot = path.join(tempHome, 'ClawOSBackUp');
  const snapshotsDir = path.join(backupRoot, 'restic', 'snapshots');
  const configDir = path.join(tempHome, '.config');
  const oldHome = process.env.HOME;

  await fs.mkdir(snapshotsDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(snapshotsDir, 'snap-old'), 'old');
  await fs.writeFile(path.join(snapshotsDir, 'snap-new'), 'new');
  await fs.utimes(path.join(snapshotsDir, 'snap-old'), new Date('2026-03-29T08:00:00.000Z'), new Date('2026-03-29T08:00:00.000Z'));
  await fs.utimes(path.join(snapshotsDir, 'snap-new'), new Date('2026-03-29T10:00:00.000Z'), new Date('2026-03-29T10:00:00.000Z'));
  await fs.writeFile(path.join(backupRoot, 'restic-crontab.txt'), `0 2 */2 * * ${tempHome}/scripts/restic-backup.sh >> ${tempHome}/.local/var/log/restic-backup.log 2>&1\n`);
  await fs.writeFile(path.join(configDir, 'restic-oss-env.sh'), 'export RESTIC_REPOSITORY="s3:https://oss-cn-hangzhou.aliyuncs.com/clawos-backup"\n');

  process.env.HOME = tempHome;

  try {
    const { getResticBackupStatus } = await import(`../src/utils/probe?ts=${Date.now()}`);
    const status = await getResticBackupStatus();

    assert.equal(status.localRepo.latest, 'snap-new');
    assert.equal(status.localRepo.count, 2);
    assert.equal(status.cloud.configured, true);
    assert.equal(status.schedule.configured, true);
    assert.equal(status.schedule.expression, '0 2 */2 * *');
    assert.equal(status.syncStatus, 'ok');
  } finally {
    process.env.HOME = oldHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});

test('getResticBackupStatus reports missing readonly config as warning state', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-restic-missing-'));
  const backupRoot = path.join(tempHome, 'ClawOSBackUp');
  const snapshotsDir = path.join(backupRoot, 'restic', 'snapshots');
  const oldHome = process.env.HOME;

  await fs.mkdir(snapshotsDir, { recursive: true });
  await fs.writeFile(path.join(snapshotsDir, 'snap-only'), 'only');

  process.env.HOME = tempHome;

  try {
    const { getResticBackupStatus } = await import(`../src/utils/probe?ts=${Date.now()}`);
    const status = await getResticBackupStatus();

    assert.equal(status.localRepo.latest, 'snap-only');
    assert.equal(status.cloud.configured, false);
    assert.equal(status.schedule.configured, false);
    assert.equal(status.syncStatus, 'missing-config');
  } finally {
    process.env.HOME = oldHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});

test('runServiceHealthCheck reports ok for reachable http endpoint', async () => {
  const http = await import('node:http');

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"success":true}');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test server');
  }

  try {
    const { runServiceHealthCheck } = await import(`../src/utils/probe?ts=${Date.now()}`);
    const result = await runServiceHealthCheck({
      type: 'http',
      url: `http://127.0.0.1:${address.port}`,
      expectedText: '"success":true',
      successMessage: '接口正常'
    });

    assert.equal(result.level, 'ok');
    assert.equal(result.summary, '接口正常');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('runServiceHealthCheck reports warning for unexpected http body', async () => {
  const http = await import('node:http');

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('not-expected');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test server');
  }

  try {
    const { runServiceHealthCheck } = await import(`../src/utils/probe?ts=${Date.now()}`);
    const result = await runServiceHealthCheck({
      type: 'http',
      url: `http://127.0.0.1:${address.port}`,
      expectedText: 'success-marker',
      successMessage: '接口正常'
    });

    assert.equal(result.level, 'warning');
    assert.match(result.summary, /返回内容不符合预期/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('getSecuritySurfaceStatus reports local-only ports and rotated secrets', async () => {
  const originalExec = childProcess.exec;
  const originalAlistPassword = process.env.CLAWOS_ALIST_ADMIN_PASSWORD;
  const originalAria2Secret = process.env.CLAWOS_ARIA2_SECRET;

  process.env.CLAWOS_ALIST_ADMIN_PASSWORD = 'secure-alist-password';
  process.env.CLAWOS_ARIA2_SECRET = 'secure-aria2-secret';

  childProcess.exec = ((command: string, callback: (...args: any[]) => void) => {
    if (command === 'ss -ltn') {
      callback(null, `State Recv-Q Send-Q Local Address:Port Peer Address:Port\nLISTEN 0 4096 127.0.0.1:5244 0.0.0.0:*\nLISTEN 0 4096 127.0.0.1:6800 0.0.0.0:*\nLISTEN 0 4096 127.0.0.1:18790 0.0.0.0:*\nLISTEN 0 4096 127.0.0.1:38080 0.0.0.0:*\nLISTEN 0 4096 *:3001 *:*\n`, '');
      return { pid: 1 } as any;
    }

    return originalExec(command, callback as any);
  }) as typeof childProcess.exec;

  try {
    const { getSecuritySurfaceStatus } = await import(`../src/utils/probe?ts=${Date.now()}`);
    const status = await getSecuritySurfaceStatus();

    assert.equal(status.summary.level, 'ok');
    assert.equal(status.ports.find((port) => port.port === 3001)?.actual, 'local-only');
    assert.equal(status.ports.find((port) => port.port === 5244)?.actual, 'local-only');
    assert.equal(status.credentials.alistAdmin.weak, false);
    assert.equal(status.credentials.aria2Secret.weak, false);
  } finally {
    childProcess.exec = originalExec;
    process.env.CLAWOS_ALIST_ADMIN_PASSWORD = originalAlistPassword;
    process.env.CLAWOS_ARIA2_SECRET = originalAria2Secret;
  }
});
