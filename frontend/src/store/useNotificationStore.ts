import { create } from 'zustand'
import {
  clearSystemNotifications,
  fetchSystemNotifications,
  markAllSystemNotificationsRead,
  markSystemNotificationRead,
  notify as createNotification,
  removeSystemNotification,
  subscribeSystemNotifications,
  type NotificationLevel,
  type SystemNotification,
} from '../lib/notifications'

const MAX_ACTIVE_TOASTS = 5
const DEFAULT_AUTO_DISMISS_MS = 5000
const DEDUPE_WINDOW_MS = 30_000
const BATCH_WINDOW_MS = 12_000

let notificationInitStarted = false
let notificationUnsubscribe: (() => void) | null = null
let notificationPollTimer: number | null = null

export interface Notification {
  id: string
  appId: string
  title: string
  message: string
  timestamp: number
  isRead: boolean
  level: NotificationLevel
  metadata: Record<string, unknown>
}

interface NotificationBehavior {
  stickyToasts: boolean
  autoDismissMs: number
}

interface SmartNotificationInput {
  appId: string
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

interface NotificationHistoryEntry {
  timestamp: number
  notificationId: string
}

interface PendingBatchEntry {
  count: number
  latestMessage: string
  latestLevel: NotificationLevel
  appId: string
  title: string
  metadata?: Record<string, unknown>
  timer: number
  messageBuilder?: (count: number, latestMessage: string) => string
}

interface NotificationStore {
  notifications: Notification[]
  activeToasts: Notification[]
  unreadCount: number
  hydrated: boolean
  behavior: NotificationBehavior
  init: () => Promise<void>
  setBehavior: (behavior: Partial<NotificationBehavior>) => void
  notify: (notification: SmartNotificationInput) => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  clearAll: () => Promise<void>
  removeNotification: (id: string) => Promise<void>
  dismissToast: (id: string) => void
}

function isCriticalNotification(notification: Notification) {
  return notification.level === 'error' || notification.metadata.riskPriority === 'critical'
}

function toLocalNotification(item: SystemNotification): Notification {
  return {
    id: item.id,
    appId: item.appId,
    title: item.title,
    message: item.message,
    timestamp: Date.parse(item.createdAt),
    isRead: item.readAt !== null,
    level: item.level,
    metadata: item.metadata,
  }
}

const notificationHistory = new Map<string, NotificationHistoryEntry>()
const pendingBatches = new Map<string, PendingBatchEntry>()

function buildDefaultBehavior(): NotificationBehavior {
  return {
    stickyToasts: false,
    autoDismissMs: DEFAULT_AUTO_DISMISS_MS,
  }
}

function buildNotificationHistoryKey(input: Pick<SmartNotificationInput, 'appId' | 'title' | 'message' | 'level'>, dedupeKey?: string) {
  return `${input.appId}:${dedupeKey || `${input.level || 'info'}:${input.title}:${input.message}`}`
}

function enqueueToast(activeToasts: Notification[], notification: Notification) {
  const next = [notification, ...activeToasts.filter((item) => item.id !== notification.id)]
  next.sort((left, right) => {
    const leftWeight = isCriticalNotification(left) ? 1 : 0
    const rightWeight = isCriticalNotification(right) ? 1 : 0
    if (leftWeight !== rightWeight) {
      return rightWeight - leftWeight
    }
    return right.timestamp - left.timestamp
  })
  return next.slice(0, MAX_ACTIVE_TOASTS)
}

function upsertNotification(current: Notification[], created: Notification) {
  const exists = current.some((item) => item.id === created.id)
  if (exists) {
    return current
  }
  return [created, ...current]
}

function applyCreatedNotification(state: Pick<NotificationStore, 'notifications' | 'activeToasts' | 'unreadCount'>, created: Notification) {
  const notifications = upsertNotification(state.notifications, created)
  const wasInserted = notifications.length !== state.notifications.length
  return {
    notifications,
    activeToasts: wasInserted ? enqueueToast(state.activeToasts, created) : state.activeToasts,
    unreadCount: wasInserted ? state.unreadCount + 1 : state.unreadCount,
  }
}

function recordNotificationHistory(input: SmartNotificationInput, notificationId: string) {
  const historyKey = buildNotificationHistoryKey(input, input.dedupeKey)
  notificationHistory.set(historyKey, {
    timestamp: Date.now(),
    notificationId,
  })
}

function shouldSkipDuplicateNotification(input: SmartNotificationInput) {
  const windowMs = input.dedupeWindowMs ?? DEDUPE_WINDOW_MS
  const historyKey = buildNotificationHistoryKey(input, input.dedupeKey)
  const previous = notificationHistory.get(historyKey)
  if (!previous) {
    return false
  }
  return Date.now() - previous.timestamp < windowMs
}

async function flushPendingBatch(batchKey: string) {
  const entry = pendingBatches.get(batchKey)
  if (!entry) {
    return
  }

  pendingBatches.delete(batchKey)
  window.clearTimeout(entry.timer)

  const batchedMessage = entry.count > 1
    ? entry.messageBuilder?.(entry.count, entry.latestMessage) || `${entry.latestMessage}（近时间段内共 ${entry.count} 次）`
    : entry.latestMessage

  await useNotificationStore.getState().notify({
    appId: entry.appId,
    title: entry.title,
    message: batchedMessage,
    level: entry.latestLevel,
    metadata: {
      ...(entry.metadata || {}),
      batchCount: entry.count,
      batchKey,
    },
    dedupeKey: `batch:${batchKey}:${batchedMessage}`,
    dedupeWindowMs: 2000,
  })
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  activeToasts: [],
  unreadCount: 0,
  hydrated: false,
  behavior: buildDefaultBehavior(),
  init: async () => {
    if (notificationInitStarted) {
      return
    }
    notificationInitStarted = true

    const initialItems = await fetchSystemNotifications({ includeRead: true, limit: 100 })
    const mapped = initialItems.map(toLocalNotification)
    const unreadCount = mapped.filter((item) => !item.isRead).length

    set({
      notifications: mapped,
      unreadCount,
      hydrated: true,
    })

    notificationUnsubscribe?.()
    notificationUnsubscribe = subscribeSystemNotifications({
      onSnapshot: (event) => {
        const snapshotMapped = event.notifications.map(toLocalNotification)
        set({
          notifications: snapshotMapped,
          unreadCount: event.unreadCount,
          hydrated: true,
        })
      },
      onChange: (event) => {
        set((state) => {
          if (event.type === 'created' && event.notification) {
            const created = toLocalNotification(event.notification)
            const exists = state.notifications.some((item) => item.id === created.id)
            if (exists) {
              return {
                notifications: state.notifications,
                activeToasts: state.activeToasts,
                unreadCount: event.unreadCount,
              }
            }

            return {
              notifications: [created, ...state.notifications],
              activeToasts: enqueueToast(state.activeToasts, created),
              unreadCount: event.unreadCount,
            }
          }

          if (event.type === 'updated' && event.notification) {
            const updated = toLocalNotification(event.notification)
            return {
              notifications: state.notifications.map((item) =>
                item.id === updated.id ? updated : item,
              ),
              activeToasts: state.activeToasts,
              unreadCount: event.unreadCount,
            }
          }

          if (event.type === 'deleted' && event.id) {
            return {
              notifications: state.notifications.filter((item) => item.id !== event.id),
              activeToasts: state.activeToasts.filter((item) => item.id !== event.id),
              unreadCount: event.unreadCount,
            }
          }

          if (event.type === 'cleared') {
            return {
              notifications: [],
              activeToasts: [],
              unreadCount: event.unreadCount,
            }
          }

          return {
            notifications: state.notifications,
            activeToasts: state.activeToasts,
            unreadCount: event.unreadCount,
          }
        })
      },
      onError: () => {
        // SSE 可能因认证策略被拦截，下面有轮询兜底
      },
    })

    if (notificationPollTimer !== null) {
      window.clearInterval(notificationPollTimer)
    }

    notificationPollTimer = window.setInterval(() => {
      void fetchSystemNotifications({ includeRead: true, limit: 100 })
        .then((serverItems) => {
          const mapped = serverItems.map(toLocalNotification)
          set((state) => {
            const existingIds = new Set(state.notifications.map((item) => item.id))
            const newUnread = mapped.filter((item) => !item.isRead && !existingIds.has(item.id))
            return {
              notifications: mapped,
              unreadCount: mapped.filter((item) => !item.isRead).length,
              activeToasts: [...newUnread, ...state.activeToasts].slice(0, MAX_ACTIVE_TOASTS),
            }
          })
        })
        .catch(() => {
          // 轮询失败不阻塞主流程
        })
    }, 6000)
  },
  setBehavior: (behavior) => {
    set((state) => ({
      behavior: {
        ...state.behavior,
        ...behavior,
      },
    }))
  },
  notify: async (notification) => {
    if (notification.batchKey) {
      const existingBatch = pendingBatches.get(notification.batchKey)
      const nextWindowMs = notification.batchWindowMs ?? BATCH_WINDOW_MS

      if (existingBatch) {
        pendingBatches.set(notification.batchKey, {
          ...existingBatch,
          count: existingBatch.count + 1,
          latestMessage: notification.message,
          latestLevel: notification.level || existingBatch.latestLevel,
          title: notification.batchTitle || existingBatch.title,
          metadata: notification.metadata || existingBatch.metadata,
          messageBuilder: notification.batchMessageBuilder || existingBatch.messageBuilder,
        })
        return
      }

      const timer = window.setTimeout(() => {
        void flushPendingBatch(notification.batchKey as string)
      }, nextWindowMs)

      pendingBatches.set(notification.batchKey, {
        count: 1,
        latestMessage: notification.message,
        latestLevel: notification.level || 'info',
        appId: notification.appId,
        title: notification.batchTitle || notification.title,
        metadata: notification.metadata,
        timer,
        messageBuilder: notification.batchMessageBuilder,
      })
      return
    }

    if (shouldSkipDuplicateNotification(notification)) {
      return
    }

    const created = await createNotification({
      appId: notification.appId,
      title: notification.title,
      message: notification.message,
      level: notification.level,
      metadata: notification.metadata,
    })

    const localCreated = toLocalNotification(created)
    recordNotificationHistory(notification, localCreated.id)

    set((state) => applyCreatedNotification(state, localCreated))
  },
  markAsRead: async (id) => {
    await markSystemNotificationRead(id)
    set((state) => {
      const nextNotifications = state.notifications.map((item) =>
        item.id === id ? { ...item, isRead: true } : item,
      )
      return {
        notifications: nextNotifications,
        unreadCount: nextNotifications.filter((item) => !item.isRead).length,
      }
    })
  },
  markAllAsRead: async () => {
    await markAllSystemNotificationsRead()
    set((state) => {
      const nextNotifications = state.notifications.map((item) => ({ ...item, isRead: true }))
      return {
        notifications: nextNotifications,
        unreadCount: 0,
      }
    })
  },
  clearAll: async () => {
    await clearSystemNotifications()
    set({
      notifications: [],
      activeToasts: [],
      unreadCount: 0,
    })
  },
  removeNotification: async (id) => {
    await removeSystemNotification(id)
    set((state) => {
      const nextNotifications = state.notifications.filter((item) => item.id !== id)
      return {
        notifications: nextNotifications,
        activeToasts: state.activeToasts.filter((item) => item.id !== id),
        unreadCount: nextNotifications.filter((item) => !item.isRead).length,
      }
    })
  },
  dismissToast: (id) =>
    set((state) => ({
      activeToasts: state.activeToasts.filter((n) => n.id !== id)
    })),
}))

export const notify = async (notification: {
  appId: string
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
}) => {
  await useNotificationStore.getState().notify(notification)
}
