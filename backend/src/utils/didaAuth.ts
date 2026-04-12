import fs from 'fs/promises';
import path from 'path';

function getDidaTokenFile() {
  return path.join(process.env.HOME || '/root', '.clawos', 'dida-token.json');
}

interface DidaTokenPayload {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  updatedAt: string;
}

export async function readPersistedDidaToken(): Promise<DidaTokenPayload | null> {
  try {
    const raw = await fs.readFile(getDidaTokenFile(), 'utf8');
    return JSON.parse(raw) as DidaTokenPayload;
  } catch {
    return null;
  }
}

export async function writePersistedDidaToken(payload: any) {
  const tokenFile = getDidaTokenFile();
  const persistedPayload = { ...payload, updatedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(tokenFile), { recursive: true });
  await fs.writeFile(
    tokenFile,
    `${JSON.stringify(persistedPayload, null, 2)}\n`,
    'utf8'
  );
  return persistedPayload;
}

export async function clearPersistedDidaToken() {
  try {
    await fs.unlink(getDidaTokenFile());
  } catch (err) {
    // Ignore
  }
}

export function isDidaAccessTokenExpired(token: DidaTokenPayload): boolean {
  const updatedAtMs = Date.parse(token.updatedAt);
  if (Number.isNaN(updatedAtMs) || token.expires_in <= 0) {
    return true;
  }

  const expiresAtMs = updatedAtMs + token.expires_in * 1000;
  const safetyWindowMs = 60 * 1000;
  return Date.now() >= expiresAtMs - safetyWindowMs;
}
