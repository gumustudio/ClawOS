export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

export interface SystemNotification {
  id: string;
  appId: string;
  title: string;
  message: string;
  level: NotificationLevel;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  metadata: Record<string, unknown>;
}

export interface CreateNotificationInput {
  appId: string;
  title: string;
  message: string;
  level?: NotificationLevel;
  metadata?: Record<string, unknown>;
}

export interface ListNotificationOptions {
  includeRead?: boolean;
  limit?: number;
  appId?: string;
}

export interface NotificationEventPayload {
  type: 'created' | 'updated' | 'deleted' | 'cleared';
  notification?: SystemNotification;
  id?: string;
  unreadCount: number;
}
