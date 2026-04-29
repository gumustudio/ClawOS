import { withBasePath } from '../../lib/basePath'

import type { ReaderArticle, ReaderDailyBrief, ReaderFeed, ReaderOverview } from './types'

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(withBasePath(input), init)
  const json = await response.json()
  if (!json.success) {
    throw new Error(json.error || '请求失败')
  }
  return json.data as T
}

export function fetchReaderOverview() {
  return requestJson<ReaderOverview>('/api/system/reader/overview')
}

export function fetchReaderFeeds() {
  return requestJson<ReaderFeed[]>('/api/system/reader/feeds')
}

export function createReaderFeed(payload: { name: string; url: string; category: string }) {
  return requestJson<ReaderFeed>('/api/system/reader/feeds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteReaderFeed(feedId: string) {
  return requestJson<void>(`/api/system/reader/feeds/${feedId}`, { method: 'DELETE' })
}

export function syncReaderNow() {
  return requestJson<{ importedArticleCount: number }>(`/api/system/reader/sync`, { method: 'POST' })
}

export function pullReaderSubscriptions() {
  return requestJson<{ importedArticleCount: number }>(`/api/system/reader/pull`, { method: 'POST' })
}

export function fetchReaderArticles(params: { category?: string; date?: string; source?: 'rss'; saved?: boolean; unread?: boolean; limit?: number; offset?: number }) {
  const search = new URLSearchParams()
  if (params.category) search.set('category', params.category)
  if (params.date) search.set('date', params.date)
  if (params.source) search.set('source', params.source)
  if (params.saved) search.set('saved', '1')
  if (params.unread) search.set('unread', '1')
  if (params.limit) search.set('limit', String(params.limit))
  if (typeof params.offset === 'number') search.set('offset', String(params.offset))
  const query = search.toString()
  return requestJson<ReaderArticle[]>(`/api/system/reader/articles${query ? `?${query}` : ''}`)
}

export function fetchReaderDailyBrief(date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  return requestJson<ReaderDailyBrief>(`/api/system/reader/daily-brief${query}`)
}

export function markReaderArticleRead(articleId: string, isRead: boolean) {
  return requestJson<ReaderArticle>(`/api/system/reader/articles/${articleId}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead }),
  })
}

export function saveReaderArticle(articleId: string, saved: boolean) {
  return requestJson<ReaderArticle>(`/api/system/reader/articles/${articleId}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saved }),
  })
}

export function translateReaderArticle(articleId: string) {
  return requestJson<ReaderArticle>(`/api/system/reader/articles/${articleId}/translate`, {
    method: 'POST',
  })
}

export function summarizeReaderArticle(articleId: string) {
  return requestJson<ReaderArticle>(`/api/system/reader/articles/${articleId}/summarize`, {
    method: 'POST',
  })
}

export function clearReaderRuntimeData() {
  return requestJson<void>(`/api/system/reader/runtime-data`, {
    method: 'DELETE',
  })
}
