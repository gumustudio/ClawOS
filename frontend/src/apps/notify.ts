import { notify } from '../store/useNotificationStore'
import type { NotificationLevel } from '../lib/notifications'

interface AppNotifyInput {
  title: string
  message: string
  level?: NotificationLevel
  metadata?: Record<string, unknown>
  dedupeKey?: string
  dedupeWindowMs?: number
  batchKey?: string
  batchWindowMs?: number
  batchTitle?: string
  batchMessageBuilder?: (count: number, latestMessage: string) => string
}

export function createAppNotifier(appId: string) {
  return async (input: AppNotifyInput) => {
    await notify({
      appId,
      title: input.title,
      message: input.message,
      level: input.level,
      metadata: input.metadata,
      dedupeKey: input.dedupeKey,
      dedupeWindowMs: input.dedupeWindowMs,
      batchKey: input.batchKey,
      batchWindowMs: input.batchWindowMs,
      batchTitle: input.batchTitle,
      batchMessageBuilder: input.batchMessageBuilder,
    })
  }
}
