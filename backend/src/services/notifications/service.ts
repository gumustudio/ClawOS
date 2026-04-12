import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { readNotifications, saveNotifications } from './store';
import type {
  CreateNotificationInput,
  ListNotificationOptions,
  NotificationEventPayload,
  SystemNotification,
} from './types';

const notificationEvents = new EventEmitter();

function nowIso(): string {
  return new Date().toISOString();
}

function countUnread(notifications: SystemNotification[]): number {
  return notifications.reduce((acc, current) => acc + (current.readAt ? 0 : 1), 0);
}

function emitPayload(payload: NotificationEventPayload): void {
  notificationEvents.emit('change', payload);
}

export function subscribeNotificationEvents(listener: (payload: NotificationEventPayload) => void): () => void {
  notificationEvents.on('change', listener);
  return () => {
    notificationEvents.off('change', listener);
  };
}

export async function listSystemNotifications(options: ListNotificationOptions = {}): Promise<SystemNotification[]> {
  const notifications = await readNotifications();
  const includeRead = options.includeRead !== false;
  const limit = typeof options.limit === 'number' ? Math.max(1, Math.min(200, Math.floor(options.limit))) : 50;
  const appId = options.appId?.trim();

  return notifications
    .filter((notification) => (includeRead ? true : !notification.readAt))
    .filter((notification) => (appId ? notification.appId === appId : true))
    .slice(0, limit);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const notifications = await readNotifications();
  return countUnread(notifications);
}

export async function createSystemNotification(input: CreateNotificationInput): Promise<SystemNotification> {
  const appId = input.appId.trim();
  const title = input.title.trim();
  const message = input.message.trim();

  if (!appId) {
    throw new Error('appId 不能为空');
  }
  if (!title) {
    throw new Error('title 不能为空');
  }
  if (!message) {
    throw new Error('message 不能为空');
  }

  const timestamp = nowIso();
  const notification: SystemNotification = {
    id: randomUUID(),
    appId,
    title,
    message,
    level: input.level ?? 'info',
    createdAt: timestamp,
    updatedAt: timestamp,
    readAt: null,
    metadata: input.metadata ?? {},
  };

  const existing = await readNotifications();
  existing.unshift(notification);
  await saveNotifications(existing);

  const unreadCount = countUnread(existing);
  emitPayload({ type: 'created', notification, unreadCount });
  logger.info(`notification created id=${notification.id} appId=${notification.appId}`, { module: 'Notifications' });
  return notification;
}

export async function markNotificationRead(id: string): Promise<SystemNotification | null> {
  const notifications = await readNotifications();
  const target = notifications.find((item) => item.id === id);
  if (!target) {
    return null;
  }

  if (!target.readAt) {
    target.readAt = nowIso();
    target.updatedAt = nowIso();
    await saveNotifications(notifications);
    emitPayload({ type: 'updated', notification: target, unreadCount: countUnread(notifications) });
  }

  return target;
}

export async function markAllNotificationsRead(): Promise<number> {
  const notifications = await readNotifications();
  const timestamp = nowIso();
  let changed = 0;
  for (const notification of notifications) {
    if (notification.readAt) {
      continue;
    }
    notification.readAt = timestamp;
    notification.updatedAt = timestamp;
    changed += 1;
  }

  if (changed > 0) {
    await saveNotifications(notifications);
    emitPayload({ type: 'updated', unreadCount: 0 });
  }

  return changed;
}

export async function removeNotification(id: string): Promise<boolean> {
  const notifications = await readNotifications();
  const next = notifications.filter((item) => item.id !== id);
  if (next.length === notifications.length) {
    return false;
  }

  await saveNotifications(next);
  emitPayload({ type: 'deleted', id, unreadCount: countUnread(next) });
  return true;
}

export async function clearNotifications(): Promise<void> {
  await saveNotifications([]);
  emitPayload({ type: 'cleared', unreadCount: 0 });
}
