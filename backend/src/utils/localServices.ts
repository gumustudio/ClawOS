import fs from 'fs/promises';
import path from 'path';

function getHomeDirectory() {
  return process.env.HOME || '/root';
}

export function getAria2RpcUrl() {
  return 'http://127.0.0.1:6800/jsonrpc';
}

export function getAria2Secret() {
  return process.env.CLAWOS_ARIA2_SECRET || '';
}

export function getAlistUrl() {
  return 'http://127.0.0.1:5244';
}

export function getAlistAdminUsername() {
  return process.env.CLAWOS_ALIST_ADMIN_USERNAME || 'admin';
}

export function getAlistAdminPassword() {
  return process.env.CLAWOS_ALIST_ADMIN_PASSWORD || '';
}

export function getAria2ConfPath() {
  return path.join(getHomeDirectory(), '.aria2', 'aria2.conf');
}

export function getAlistConfigPath() {
  return path.join(getHomeDirectory(), '.clawos', 'alist', 'config.json');
}

export async function ensureAria2Config(secret: string) {
  const configPath = getAria2ConfPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  let content = '';
  try {
    content = await fs.readFile(configPath, 'utf8');
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const nextLines = content.length > 0 ? content.split(/\r?\n/) : [];
  const replaceOrAppend = (pattern: RegExp, nextLine: string) => {
    const index = nextLines.findIndex((line) => pattern.test(line));
    if (index >= 0) {
      nextLines[index] = nextLine;
      return;
    }

    nextLines.push(nextLine);
  };

  replaceOrAppend(/^rpc-listen-all=/, 'rpc-listen-all=false');
  replaceOrAppend(/^rpc-secret=/, `rpc-secret=${secret}`);

  await fs.writeFile(configPath, `${nextLines.filter(Boolean).join('\n')}\n`, 'utf8');
}

export async function ensureAlistConfig(address: string) {
  const configPath = getAlistConfigPath();
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw) as {
    scheme?: {
      address?: string;
      http_port?: number;
    };
  };

  parsed.scheme = {
    ...parsed.scheme,
    address,
    http_port: parsed.scheme?.http_port || 5244
  };

  await fs.writeFile(configPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
}
