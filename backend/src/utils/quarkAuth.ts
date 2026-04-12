import fs from 'fs/promises';
import path from 'path';

export interface QuarkAuthSession {
  cookieHeader: string;
  cookies: Record<string, string>;
  updatedAt: string;
}

const authDir = path.join(process.env.HOME || '/root', '.clawos');
const sessionFile = path.join(authDir, 'quark-auth-session.json');
let cachedSession: QuarkAuthSession | null = null;

function parseSetCookieHeaders(setCookieHeaders: string[] | undefined, currentCookies: Record<string, string>) {
  if (!setCookieHeaders || setCookieHeaders.length === 0) {
    return currentCookies;
  }

  const nextCookies = { ...currentCookies };

  for (const header of setCookieHeaders) {
    const [cookiePair] = header.split(';');
    if (!cookiePair) {
      continue;
    }

    const separatorIndex = cookiePair.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const cookieName = cookiePair.slice(0, separatorIndex).trim();
    const cookieValue = cookiePair.slice(separatorIndex + 1).trim();

    if (!cookieName) {
      continue;
    }

    if (cookieValue) {
      nextCookies[cookieName] = cookieValue;
    } else {
      delete nextCookies[cookieName];
    }
  }

  return nextCookies;
}

function buildCookieHeader(cookies: Record<string, string>) {
  return Object.entries(cookies)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export async function readQuarkAuthSession(): Promise<QuarkAuthSession | null> {
  if (cachedSession) {
    return cachedSession;
  }

  try {
    const raw = await fs.readFile(sessionFile, 'utf-8');
    const data = JSON.parse(raw) as QuarkAuthSession;
    if (!data.cookieHeader) {
      return null;
    }
    cachedSession = data;
    return data;
  } catch {
    return null;
  }
}

export function getCachedQuarkAuthSession(): QuarkAuthSession | null {
  return cachedSession;
}

export async function writeQuarkAuthSession(nextCookies: Record<string, string>) {
  const cookieHeader = buildCookieHeader(nextCookies);
  const session: QuarkAuthSession = {
    cookieHeader,
    cookies: nextCookies,
    updatedAt: new Date().toISOString()
  };

  cachedSession = session;
  await fs.mkdir(authDir, { recursive: true });
  await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
  return session;
}

export async function updateQuarkAuthSession(setCookieHeaders: string[] | undefined) {
  const current = await readQuarkAuthSession();
  const nextCookies = parseSetCookieHeaders(setCookieHeaders, current?.cookies || {});
  return writeQuarkAuthSession(nextCookies);
}

export async function clearQuarkAuthSession() {
  cachedSession = null;
  try {
    await fs.unlink(sessionFile);
  } catch {
    // ignore missing file
  }
}
