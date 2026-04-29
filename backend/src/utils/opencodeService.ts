import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const OPENCODE_WEB_UNIT = 'opencode-web.service';
export const OPENCODE_WEB_PORT = 4096;
export const OPENCODE_WEB_TARGET = `http://127.0.0.1:${OPENCODE_WEB_PORT}`;
export const OPENCODE_APP_LOCK_PASSWORD = process.env.CLAWOS_OPENCODE_APP_PASSWORD?.trim() || process.env.OPENCODE_SERVER_PASSWORD?.trim() || '';
export const OPENCODE_SERVER_USERNAME = process.env.OPENCODE_SERVER_USERNAME?.trim() || 'opencode';
export const OPENCODE_SERVER_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD?.trim() || '';

export type OpenCodeServiceAction = 'start' | 'stop' | 'restart';

export interface OpenCodeServiceStatus {
  unit: string;
  status: string;
  isRunning: boolean;
  health: 'ok' | 'starting' | 'down';
  healthDetail: string;
}

export function getOpenCodeBasicAuthHeader(): string {
  return `Basic ${Buffer.from(`${OPENCODE_SERVER_USERNAME}:${OPENCODE_SERVER_PASSWORD}`).toString('base64')}`;
}

export function hasOpenCodeServerPassword(): boolean {
  return OPENCODE_SERVER_PASSWORD.length > 0;
}

export function hasOpenCodeAppLockPassword(): boolean {
  return OPENCODE_APP_LOCK_PASSWORD.length > 0;
}

async function systemctlUser(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('systemctl', ['--user', ...args], { timeout: 12000 });
  return stdout.trim();
}

export async function controlOpenCodeService(action: OpenCodeServiceAction): Promise<OpenCodeServiceStatus> {
  await systemctlUser([action, OPENCODE_WEB_UNIT]);
  return getOpenCodeServiceStatus();
}

async function getSystemdActiveState(): Promise<string> {
  try {
    const state = await systemctlUser(['is-active', OPENCODE_WEB_UNIT]);
    return state || 'unknown';
  } catch {
    return 'inactive';
  }
}

async function probeOpenCodeHealth(): Promise<{ health: OpenCodeServiceStatus['health']; detail: string }> {
  if (!hasOpenCodeServerPassword()) {
    return { health: 'down', detail: 'OPENCODE_SERVER_PASSWORD is not configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${OPENCODE_WEB_TARGET}/global/health`, {
      headers: { Authorization: getOpenCodeBasicAuthHeader() },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { health: 'starting', detail: `HTTP ${response.status}` };
    }

    const payload = await response.json().catch(() => null) as { healthy?: boolean; version?: string } | null;
    if (payload?.healthy) {
      return { health: 'ok', detail: payload.version ? `OpenCode ${payload.version}` : 'OpenCode health ok' };
    }

    return { health: 'starting', detail: 'health payload not ready' };
  } catch (error: any) {
    return { health: 'starting', detail: error.name === 'AbortError' ? 'health probe timeout' : error.message };
  }
}

export async function getOpenCodeServiceStatus(): Promise<OpenCodeServiceStatus> {
  const status = await getSystemdActiveState();
  const isRunning = status === 'active';
  if (!isRunning) {
    return {
      unit: OPENCODE_WEB_UNIT,
      status,
      isRunning,
      health: 'down',
      healthDetail: 'OpenCode Web service is not running',
    };
  }

  const probe = await probeOpenCodeHealth();
  return {
    unit: OPENCODE_WEB_UNIT,
    status,
    isRunning,
    health: probe.health,
    healthDetail: probe.detail,
  };
}
