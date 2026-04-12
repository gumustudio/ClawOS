import { withBasePath } from './basePath'

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface SystemNotification {
  id: string
  appId: string
  title: string
  message: string
  level: NotificationLevel
  createdAt: string
  updatedAt: string
  readAt: string | null
  metadata: Record<string, unknown>
}

export interface CreateSystemNotificationInput {
  appId: string
  title: string
  message: string
  level?: NotificationLevel
  metadata?: Record<string, unknown>
}

interface ApiResult<T> {
  success: boolean
  data: T
  error?: string
}

interface NotificationSnapshotEvent {
  notifications: SystemNotification[]
  unreadCount: number
}

interface NotificationChangeEvent {
  type: 'created' | 'updated' | 'deleted' | 'cleared'
  notification?: SystemNotification
  id?: string
  unreadCount: number
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiResult<T>
  if (!payload.success) {
    throw new Error(payload.error || '通知接口请求失败')
  }
  return payload.data
}

export async function fetchSystemNotifications(options?: {
  includeRead?: boolean
  limit?: number
  appId?: string
}): Promise<SystemNotification[]> {
  const params = new URLSearchParams()
  if (options?.includeRead === false) {
    params.set('includeRead', 'false')
  }
  if (typeof options?.limit === 'number') {
    params.set('limit', String(options.limit))
  }
  if (options?.appId) {
    params.set('appId', options.appId)
  }

  const query = params.toString()
  const response = await fetch(withBasePath(`/api/system/notifications${query ? `?${query}` : ''}`))
  return parseResponse<SystemNotification[]>(response)
}

export async function createSystemNotification(input: CreateSystemNotificationInput): Promise<SystemNotification> {
  const response = await fetch(withBasePath('/api/system/notifications'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseResponse<SystemNotification>(response)
}

export async function markSystemNotificationRead(id: string): Promise<SystemNotification> {
  const response = await fetch(withBasePath(`/api/system/notifications/${id}/read`), { method: 'POST' })
  return parseResponse<SystemNotification>(response)
}

export async function markAllSystemNotificationsRead(): Promise<number> {
  const response = await fetch(withBasePath('/api/system/notifications/read-all'), { method: 'POST' })
  const data = await parseResponse<{ updatedCount: number }>(response)
  return data.updatedCount
}

export async function clearSystemNotifications(): Promise<void> {
  const response = await fetch(withBasePath('/api/system/notifications'), { method: 'DELETE' })
  await parseResponse<{ cleared: boolean }>(response)
}

export async function removeSystemNotification(id: string): Promise<void> {
  const response = await fetch(withBasePath(`/api/system/notifications/${id}`), { method: 'DELETE' })
  await parseResponse<{ removed: boolean }>(response)
}

export function subscribeSystemNotifications(handlers: {
  onSnapshot?: (event: NotificationSnapshotEvent) => void
  onChange?: (event: NotificationChangeEvent) => void
  onError?: (error: Event) => void
}): () => void {
  const source = new EventSource(withBasePath('/api/system/notifications/stream'))

  source.addEventListener('snapshot', (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as NotificationSnapshotEvent
      handlers.onSnapshot?.(payload)
    } catch {
      // ignore malformed payload
    }
  })

  source.addEventListener('change', (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as NotificationChangeEvent
      handlers.onChange?.(payload)
    } catch {
      // ignore malformed payload
    }
  })

  source.addEventListener('error', (event) => {
    handlers.onError?.(event)
  })

  return () => {
    source.close()
  }
}

export async function notify(input: CreateSystemNotificationInput): Promise<SystemNotification> {
  return createSystemNotification(input)
}
