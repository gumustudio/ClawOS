import fs from 'fs/promises';
import path from 'path';

function getNeteaseCookieFile() {
  return path.join(process.env.HOME || '/root', '.clawos', 'music_cache', 'netease-cookie.json');
}

interface NeteaseCookiePayload {
  cookie: string;
  updatedAt: string;
}

function normalizeCookie(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function readPersistedNeteaseCookie() {
  try {
    const raw = await fs.readFile(getNeteaseCookieFile(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<NeteaseCookiePayload>;
    return normalizeCookie(parsed.cookie);
  } catch {
    return '';
  }
}

export async function writePersistedNeteaseCookie(cookie: string) {
  const normalizedCookie = normalizeCookie(cookie);
  const cookieFile = getNeteaseCookieFile();
  await fs.mkdir(path.dirname(cookieFile), { recursive: true });
  await fs.writeFile(
    cookieFile,
    `${JSON.stringify({ cookie: normalizedCookie, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  );
  return normalizedCookie;
}

export async function clearPersistedNeteaseCookie() {
  await writePersistedNeteaseCookie('');
}
