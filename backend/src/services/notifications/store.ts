import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import type { SystemNotification } from './types';

const MAX_NOTIFICATIONS = 500;

function getNotificationsFilePath(): string {
  const homeDir = process.env.HOME?.trim() || require('os').homedir();
  return path.join(homeDir, '.clawos', 'notifications.json');
}

async function ensureNotificationsDir(): Promise<void> {
  const filePath = getNotificationsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function normalizeNotification(raw: unknown): SystemNotification | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.appId !== 'string' || typeof obj.title !== 'string' || typeof obj.message !== 'string') {
    return null;
  }

  const createdAt = typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString();
  const updatedAt = typeof obj.updatedAt === 'string' ? obj.updatedAt : createdAt;
  const readAt = typeof obj.readAt === 'string' ? obj.readAt : null;
  const level = obj.level;
  const metadata = obj.metadata && typeof obj.metadata === 'object' ? (obj.metadata as Record<string, unknown>) : {};
  const normalizedLevel = level === 'success' || level === 'warning' || level === 'error' ? level : 'info';

  return {
    id: obj.id,
    appId: obj.appId,
    title: obj.title,
    message: obj.message,
    level: normalizedLevel,
    createdAt,
    updatedAt,
    readAt,
    metadata,
  };
}

export async function readNotifications(): Promise<SystemNotification[]> {
  const filePath = getNotificationsFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed
      .map((item) => normalizeNotification(item))
      .filter((item): item is SystemNotification => item !== null);

    return normalized.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      logger.warn(`readNotifications failed: ${nodeError.message}`, { module: 'Notifications' });
    }
    return [];
  }
}

export async function saveNotifications(notifications: SystemNotification[]): Promise<void> {
  await ensureNotificationsDir();
  const filePath = getNotificationsFilePath();
  const trimmed = notifications
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_NOTIFICATIONS);
  await fs.writeFile(filePath, `${JSON.stringify(trimmed, null, 2)}\n`, 'utf8');
}
