import si from 'systeminformation';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';
import { getAlistAdminPassword, getAria2Secret } from './localServices';

import os from 'os';

const execPromise = util.promisify(exec);

function getProjectRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

const CLAWOS_WATCHDOG_STATE_FILE = path.join(getProjectRoot(), 'logs', 'clawos-watchdog-status.json');
const CLAWOS_DISPLAY_WATCHDOG_STATE_FILE = path.join(getProjectRoot(), 'logs', 'clawos-display-watchdog-status.json');
const OPENCLAW_WATCHDOG_STATE_FILE = path.join(os.homedir(), '.openclaw', 'watchdog-status.json');

export const getHardwareStats = async () => {
  try {
    const [cpuLoad, mem, fsSize] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize()
    ]);

    const mainDisk = fsSize.find(disk => disk.mount === '/') || fsSize[0];

    return {
      uptime: process.uptime(), // ClawOS backend uptime in seconds
      cpu: {
        usage: cpuLoad.currentLoad.toFixed(1),
        cores: cpuLoad.cpus.length
      },
      memory: {
        total: (mem.total / (1024 ** 3)).toFixed(2),
        used: (mem.active / (1024 ** 3)).toFixed(2),
        free: (mem.available / (1024 ** 3)).toFixed(2),
        usagePercent: ((mem.active / mem.total) * 100).toFixed(1)
      },
      disk: {
        total: (mainDisk.size / (1024 ** 3)).toFixed(2),
        used: (mainDisk.used / (1024 ** 3)).toFixed(2),
        usagePercent: mainDisk.use.toFixed(1)
      }
    };
  } catch (error: any) {
    throw new Error(`Failed to get hardware stats: ${error.message}`);
  }
};

export const getServiceStatus = async (serviceName: string, isUser = true) => {
  try {
    const userFlag = isUser ? '--user ' : '';
    // Use is-active for a simple active/inactive string
    const { stdout } = await execPromise(`systemctl ${userFlag}is-active ${serviceName}`);
    const status = stdout.trim();
    return {
      name: serviceName,
      status: status === 'active' ? 'running' : status,
      isRunning: status === 'active'
    };
  } catch (error: any) {
    // systemctl is-active returns non-zero exit code if inactive
    return {
      name: serviceName,
      status: 'stopped',
      isRunning: false
    };
  }
};

export interface MonitoredServiceDefinition {
  id: string;
  unit: string;
  description: string;
  kind: 'core' | 'watchdog';
  isUser?: boolean;
  healthCheck?: HealthCheckDefinition;
}

export type HealthCheckDefinition =
  | {
      type: 'http';
      url: string;
      successMessage: string;
      expectedText?: string;
      acceptedStatuses?: number[];
      timeoutMs?: number;
    }
  | {
      type: 'jsonrpc';
      url: string;
      method: string;
      params?: unknown[];
      successMessage: string;
      timeoutMs?: number;
    };

export interface ServiceHealthStatus {
  level: 'ok' | 'warning' | 'down' | 'unknown';
  summary: string;
  detail?: string;
}

interface WatchdogStatusSnapshot {
  timestamp: string;
  result: string;
  message: string;
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function runServiceHealthCheck(healthCheck: HealthCheckDefinition, authHeader?: string): Promise<ServiceHealthStatus> {
  if (healthCheck.type === 'http') {
    try {
      const fetchInit: RequestInit = {};
      if (authHeader) {
        fetchInit.headers = { 'Authorization': authHeader };
      }
      const response = await fetchWithTimeout(healthCheck.url, fetchInit, healthCheck.timeoutMs);
      const acceptedStatuses = healthCheck.acceptedStatuses ?? [200];

      if (!acceptedStatuses.includes(response.status)) {
        return {
          level: 'warning',
          summary: '接口请求已返回，但状态码异常',
          detail: `HTTP ${response.status}: ${healthCheck.url}`
        };
      }

      if (healthCheck.expectedText) {
        const body = await response.text();
        if (!body.includes(healthCheck.expectedText)) {
          return {
            level: 'warning',
            summary: '接口可访问，但返回内容不符合预期',
            detail: `缺少关键标记：${healthCheck.expectedText}`
          };
        }
      }

      return {
        level: 'ok',
        summary: healthCheck.successMessage,
        detail: `HTTP ${response.status}`
      };
    } catch (error: any) {
      return {
        level: 'warning',
        summary: '进程在运行，但接口探测失败',
        detail: error.name === 'AbortError' ? '请求超时' : error.message
      };
    }
  }

  try {
    const response = await fetchWithTimeout(
      healthCheck.url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'clawos-health-check',
          method: healthCheck.method,
          params: healthCheck.params ?? []
        })
      },
      healthCheck.timeoutMs,
    );

    if (!response.ok) {
      return {
        level: 'warning',
        summary: 'RPC 接口已返回，但状态码异常',
        detail: `HTTP ${response.status}: ${healthCheck.url}`
      };
    }

    const payload = await response.json() as { error?: { message?: string } };
    if (payload.error) {
      return {
        level: 'warning',
        summary: 'RPC 接口可连接，但返回了错误',
        detail: payload.error.message || '未知 RPC 错误'
      };
    }

    return {
      level: 'ok',
      summary: healthCheck.successMessage,
      detail: healthCheck.method
    };
  } catch (error: any) {
    return {
      level: 'warning',
      summary: '进程在运行，但 RPC 探测失败',
      detail: error.name === 'AbortError' ? '请求超时' : error.message
    };
  }
}

async function getCoreServiceHealth(definition: MonitoredServiceDefinition, isRunning: boolean, authHeader?: string): Promise<ServiceHealthStatus | null> {
  if (definition.kind !== 'core') {
    return null;
  }

  if (!isRunning) {
    return {
      level: 'down',
      summary: '服务未运行，当前不可用'
    };
  }

  if (!definition.healthCheck) {
    return {
      level: 'unknown',
      summary: '当前仅检测进程状态，未做接口探测'
    };
  }

  return runServiceHealthCheck(definition.healthCheck, authHeader);
}

const getWatchdogSnapshot = async (serviceId: string): Promise<WatchdogStatusSnapshot | null> => {
  const stateFileMap: Record<string, string> = {
    'clawos-watchdog': CLAWOS_WATCHDOG_STATE_FILE,
    'clawos-display-watchdog': CLAWOS_DISPLAY_WATCHDOG_STATE_FILE,
    'openclaw-watchdog': OPENCLAW_WATCHDOG_STATE_FILE
  };

  const stateFile = stateFileMap[serviceId];
  if (!stateFile) {
    return null;
  }

  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WatchdogStatusSnapshot>;
    if (!parsed.timestamp || !parsed.result || !parsed.message) {
      return null;
    }

    return {
      timestamp: parsed.timestamp,
      result: parsed.result,
      message: parsed.message
    };
  } catch {
    return null;
  }
};

export const getMonitoredServices = async (definitions: MonitoredServiceDefinition[], password?: string) => {
  const authHeader = password ? 'Basic ' + Buffer.from('clawos:' + password).toString('base64') : undefined;
  
  const results = await Promise.all(
    definitions.map(async (definition) => {
      const status = await getServiceStatus(definition.unit, definition.isUser ?? true);
      const watchdogStatus = await getWatchdogSnapshot(definition.id);
      const health = await getCoreServiceHealth(definition, status.isRunning, authHeader);
      return {
        id: definition.id,
        name: status.name,
        status: status.status,
        isRunning: status.isRunning,
        description: definition.description,
        kind: definition.kind,
        watchdogStatus,
        health
      };
    })
  );

  return results;
};

export const getNetworkStats = async () => {
  try {
    const interfaces = await si.networkInterfaces();
    const networkData = Array.isArray(interfaces) ? interfaces : [interfaces];
    
    // Find Tailscale interface specifically
    const tailscaleInfo = networkData.find((iface: any) => iface.iface === 'tailscale0');
    
    const stats = await si.networkStats('*');
    let totalRxSec = 0;
    let totalTxSec = 0;
    if (Array.isArray(stats)) {
      stats.forEach(s => {
        // Exclude loopback to avoid double counting internal traffic, only sum actual network interfaces
        if (s.iface !== 'lo') {
          totalRxSec += (s.rx_sec || 0);
          totalTxSec += (s.tx_sec || 0);
        }
      });
    }

    return {
      speed: {
        rx_sec: totalRxSec,
        tx_sec: totalTxSec
      },
      interfaces: networkData.map((iface: any) => ({
        name: iface.iface,
        ip4: iface.ip4,
        type: iface.type
      })).filter(iface => iface.ip4), // only return those with ipv4
      tailscale: tailscaleInfo ? {
        ip: tailscaleInfo.ip4,
        active: true
      } : { active: false }
    };
  } catch (error: any) {
    throw new Error(`Failed to get network stats: ${error.message}`);
  }
};

export const getTimeshiftStatus = async () => {
  try {
    // Attempt to read the timeshift snapshots directory
    const snapshotDir = '/timeshift/snapshots';
    const snapshotDirAlt = '/run/timeshift/backup/timeshift/snapshots';
    
    let targetDir = '';
    try {
      await fs.access(snapshotDir);
      targetDir = snapshotDir;
    } catch {
      try {
        await fs.access(snapshotDirAlt);
        targetDir = snapshotDirAlt;
      } catch {
        return { latest: null, error: 'Timeshift snapshot directory not found or permission denied' };
      }
    }

    const files = await fs.readdir(targetDir);
    // Filter folders that look like dates YYYY-MM-DD_HH-mm-ss
    const snapshots = files.filter(f => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(f));
    
    if (snapshots.length === 0) {
      return { latest: null, message: 'No snapshots found' };
    }

    // Sort to get latest
    snapshots.sort().reverse();
    const latest = snapshots[0];
    
    // Parse date (e.g. 2026-03-26_03-00-01)
    const dateStr = latest.replace(/_/, ' ').replace(/-/g, (match, offset) => {
      // replace the first two dashes (date) with -, the rest (time) with :
      if (offset > 10) return ':';
      return match;
    });

    return { latest: latest, timestamp: new Date(dateStr).toISOString() };
  } catch (error: any) {
    return { latest: null, error: error.message };
  }
};

export interface DirectoryBackupStatus {
  directory: string;
  latest: string | null;
  latestName?: string;
  timestamp?: string;
  count: number;
  error?: string;
  message?: string;
}

export interface OpenClawBackupStatus {
  rootDirectory: string;
  indexFile: string;
  hasIndexFile: boolean;
  latestIndexedVersion: string | null;
  latestIndexedStamp: string | null;
  syncStatus: 'ok' | 'warning' | 'missing-index';
  syncMessage: string;
  versions: DirectoryBackupStatus;
  zips: DirectoryBackupStatus;
}

export interface ResticBackupStatus {
  rootDirectory: string;
  localRepo: DirectoryBackupStatus;
  cloud: {
    provider: 'aliyun-oss';
    configured: boolean;
    repository: string | null;
    message: string;
  };
  schedule: {
    configured: boolean;
    expression: string | null;
    source: string | null;
    message: string;
  };
  syncStatus: 'ok' | 'warning' | 'missing-config';
  syncMessage: string;
}

export interface SecuritySurfaceStatus {
  summary: {
    level: 'ok' | 'warning';
    message: string;
  };
  ports: Array<{
    name: string;
    port: number;
    expected: 'local-only' | 'direct-access';
    actual: 'local-only' | 'direct-access' | 'closed';
    ok: boolean;
  }>;
  credentials: {
    alistAdmin: {
      weak: boolean;
      source: 'env';
    };
    aria2Secret: {
      weak: boolean;
      source: 'env';
    };
  };
}

function isLoopbackAddress(address: string) {
  return address === '127.0.0.1' || address === '::1' || address === '[::1]';
}

async function getListeningPorts() {
  const { stdout } = await execPromise('ss -ltn');
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .map((parts) => parts[3] || '')
    .map((addressPort) => {
      if (addressPort.startsWith('[')) {
        const ipv6Match = addressPort.match(/^(\[[^\]]+\]):(\d+)$/);
        if (!ipv6Match) {
          return null;
        }

        return {
          address: ipv6Match[1],
          port: Number(ipv6Match[2])
        };
      }

      const match = addressPort.match(/^(.*):(\d+)$/);
      if (!match) {
        return null;
      }

      return {
        address: match[1],
        port: Number(match[2])
      };
    })
    .filter((entry): entry is { address: string; port: number } => entry !== null);
}

function getPortExposure(addresses: Array<{ address: string; port: number }>, port: number): 'local-only' | 'direct-access' | 'closed' {
  const matches = addresses.filter((entry) => entry.port === port);
  if (matches.length === 0) {
    return 'closed';
  }

  if (matches.every((entry) => isLoopbackAddress(entry.address))) {
    return 'local-only';
  }

  return 'direct-access';
}

function sanitizeRepository(raw: string) {
  return raw
    .replace(/https?:\/\/[^/]+\//i, 'https://***/')
    .replace(/\b([A-Za-z0-9_-]{8,})\b/g, (token) => {
      if (token.startsWith('s3') || token === 'https' || token === 'aliyuncs' || token === 'clawos-backup') {
        return token;
      }

      if (token.length <= 6) {
        return token;
      }

      return `${token.slice(0, 2)}***${token.slice(-2)}`;
    });
}

async function readResticScheduleStatus(rootDirectory: string) {
  const scheduleSources = [
    {
      path: path.join(rootDirectory, 'restic-crontab.txt'),
      type: 'user-crontab'
    },
    {
      path: path.join(rootDirectory, 'restic-cron.conf'),
      type: 'cron-conf'
    }
  ] as const;

  for (const source of scheduleSources) {
    try {
      const content = await fs.readFile(source.path, 'utf8');
      const expressionLine = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#') && line.includes('restic-backup.sh'));

      if (!expressionLine) {
        continue;
      }

      const [minute, hour, dayOfMonth, month, dayOfWeek] = expressionLine.split(/\s+/);
      const expression = [minute, hour, dayOfMonth, month, dayOfWeek].every(Boolean)
        ? [minute, hour, dayOfMonth, month, dayOfWeek].join(' ')
        : null;

      return {
        configured: true,
        expression,
        source: source.type,
        message: expression ? `已检测到计划任务：${expression}` : '已检测到计划任务配置'
      };
    } catch {
      continue;
    }
  }

  return {
    configured: false,
    expression: null,
    source: null,
    message: '未检测到 restic 定时任务配置'
  };
}

async function readResticCloudStatus() {
  const configPath = path.join(process.env.HOME || '/root', '.config', 'restic-oss-env.sh');

  try {
    const content = await fs.readFile(configPath, 'utf8');
    const repoMatch = content.match(/^export\s+RESTIC_REPOSITORY="([^"]+)"/m);
    const repository = repoMatch?.[1] ? sanitizeRepository(repoMatch[1]) : null;

    return {
      provider: 'aliyun-oss' as const,
      configured: true,
      repository,
      message: repository ? '已检测到 OSS 备份配置' : '已检测到 OSS 配置文件'
    };
  } catch {
    return {
      provider: 'aliyun-oss' as const,
      configured: false,
      repository: null,
      message: '未检测到 OSS 配置文件'
    };
  }
}

function getOpenClawEntryBaseName(entryName: string | null | undefined) {
  if (!entryName) {
    return null;
  }

  return entryName.replace(/\.zip$/i, '');
}

function matchesIndexedBackupEntry(entryName: string | null, version: string | null, stamp: string | null) {
  if (!entryName || !version || !stamp) {
    return false;
  }

  return entryName.startsWith(`${version}-`) && entryName.endsWith(`-${stamp}`);
}

async function readLatestOpenClawIndex(indexFile: string) {
  const content = await fs.readFile(indexFile, 'utf-8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\|\s*v[^|]+\|/.test(line));

  const latestLine = lines.at(-1);
  if (!latestLine) {
    return { version: null, stamp: null };
  }

  const cells = latestLine
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 4) {
    return { version: null, stamp: null };
  }

  return {
    version: cells[0] || null,
    stamp: cells[3] || null
  };
}

export const getDirectoryBackupStatus = async (targetDir: string): Promise<DirectoryBackupStatus> => {
  try {
    await fs.access(targetDir);

    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const backupEntries = entries.filter((entry) => !entry.name.startsWith('.'));

    if (backupEntries.length === 0) {
      return {
        directory: targetDir,
        latest: null,
        count: 0,
        message: '暂无备份记录'
      };
    }

    const entryStats = await Promise.all(
      backupEntries.map(async (entry) => {
        const entryPath = path.join(targetDir, entry.name);
        const stats = await fs.stat(entryPath);
        return {
          name: entry.name,
          modifiedAtMs: stats.mtimeMs,
          timestamp: stats.mtime.toISOString()
        };
      })
    );

    entryStats.sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);
    const latestEntry = entryStats[0];

    return {
      directory: targetDir,
      latest: latestEntry.name,
      latestName: latestEntry.name,
      timestamp: latestEntry.timestamp,
      count: backupEntries.length
    };
  } catch (error: any) {
    return {
      directory: targetDir,
      latest: null,
      count: 0,
      error: error.code === 'ENOENT' ? '备份目录不存在' : error.message
    };
  }
};

export const getOpenClawBackupStatus = async (): Promise<OpenClawBackupStatus> => {
  const backupDir = path.join(process.env.HOME || '/root', 'OpenCLawSpace', 'ClawBackUp');
  const indexFile = path.join(backupDir, 'VERSIONS.md');

  let hasIndexFile = false;
  let latestIndexedVersion: string | null = null;
  let latestIndexedStamp: string | null = null;
  try {
    await fs.access(indexFile);
    hasIndexFile = true;
    const indexInfo = await readLatestOpenClawIndex(indexFile);
    latestIndexedVersion = indexInfo.version;
    latestIndexedStamp = indexInfo.stamp;
  } catch {
    hasIndexFile = false;
  }

  const [versions, zips] = await Promise.all([
    getDirectoryBackupStatus(path.join(backupDir, 'versions')),
    getDirectoryBackupStatus(path.join(backupDir, 'zips'))
  ]);

  const latestVersionBackup = getOpenClawEntryBaseName(versions.latest);
  const latestZipBackup = getOpenClawEntryBaseName(zips.latest);
  const syncTargets = [latestVersionBackup, latestZipBackup].filter(Boolean);
  const allBackupFormatsAligned = syncTargets.length > 0 && syncTargets.every((entry) => entry === syncTargets[0]);

  let syncStatus: OpenClawBackupStatus['syncStatus'] = 'ok';
  let syncMessage = 'versions 与 zips 最新备份一致';

  if (!hasIndexFile) {
    syncStatus = 'missing-index';
    syncMessage = '未找到 VERSIONS.md，无法校验索引是否与备份同步';
  } else if (!allBackupFormatsAligned) {
    syncStatus = 'warning';
    syncMessage = 'versions 与 zips 的最新备份不一致，请检查备份流程';
  } else if (!matchesIndexedBackupEntry(latestVersionBackup, latestIndexedVersion, latestIndexedStamp)) {
    syncStatus = 'warning';
    syncMessage = 'VERSIONS.md 最新索引与实际最新备份不一致';
  }

  return {
    rootDirectory: backupDir,
    indexFile,
    hasIndexFile,
    latestIndexedVersion,
    latestIndexedStamp,
    syncStatus,
    syncMessage,
    versions,
    zips
  };
};

export const getResticBackupStatus = async (): Promise<ResticBackupStatus> => {
  const backupDir = path.join(process.env.HOME || '/root', 'ClawOSBackUp');
  const [localRepo, cloud, schedule] = await Promise.all([
    getDirectoryBackupStatus(path.join(backupDir, 'restic', 'snapshots')),
    readResticCloudStatus(),
    readResticScheduleStatus(backupDir)
  ]);

  let syncStatus: ResticBackupStatus['syncStatus'] = 'ok';
  let syncMessage = '本地仓库、OSS 配置与计划任务已就绪';

  if (localRepo.error) {
    syncStatus = 'warning';
    syncMessage = '本地 restic 仓库不可用，请检查仓库目录';
  } else if (!localRepo.latest) {
    syncStatus = 'warning';
    syncMessage = '本地 restic 仓库存在，但尚未发现快照';
  } else if (!cloud.configured || !schedule.configured) {
    syncStatus = 'missing-config';
    syncMessage = 'restic 观测已接入，但 OSS 或定时任务配置缺失';
  }

  return {
    rootDirectory: backupDir,
    localRepo,
    cloud,
    schedule,
    syncStatus,
    syncMessage
  };
};

export const getSecuritySurfaceStatus = async (): Promise<SecuritySurfaceStatus> => {
  const listeningPorts = await getListeningPorts();
  const ports = [
    { name: 'ClawOS 主入口', port: 3001, expected: 'local-only', actual: getPortExposure(listeningPorts, 3001), ok: false },
    { name: 'AList 后台', port: 5244, expected: 'local-only', actual: getPortExposure(listeningPorts, 5244), ok: false },
    { name: 'aria2 RPC', port: 6800, expected: 'local-only', actual: getPortExposure(listeningPorts, 6800), ok: false },
    { name: 'FileBrowser', port: 18790, expected: 'local-only', actual: getPortExposure(listeningPorts, 18790), ok: false },
    { name: 'SearXNG', port: 38080, expected: 'local-only', actual: getPortExposure(listeningPorts, 38080), ok: false }
  ] as const satisfies Array<{
    name: string;
    port: number;
    expected: 'local-only' | 'direct-access';
    actual: 'local-only' | 'direct-access' | 'closed';
    ok: boolean;
  }>;

  const normalizedPorts: SecuritySurfaceStatus['ports'] = ports.map((entry) => ({
    ...entry,
    ok: entry.actual === entry.expected
  }));

  const credentials = {
    alistAdmin: {
      weak: getAlistAdminPassword() === 'clawos_admin',
      source: 'env' as const
    },
    aria2Secret: {
      weak: getAria2Secret() === 'clawos_aria2_secret',
      source: 'env' as const
    }
  };

  const hasRisk = normalizedPorts.some((port) => !port.ok) || credentials.alistAdmin.weak || credentials.aria2Secret.weak;

  return {
    summary: {
      level: hasRisk ? 'warning' : 'ok',
      message: hasRisk ? '仍有敏感服务暴露或弱凭据配置' : '敏感服务已按预期收口，弱凭据已替换'
    },
    ports: normalizedPorts,
    credentials
  };
};
