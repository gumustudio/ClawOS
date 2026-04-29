import test from 'node:test'
import assert from 'node:assert/strict'

import { clearReaderRuntimeData, createReaderFeed, fetchReaderArticles, pullReaderSubscriptions, summarizeReaderArticle, syncReaderNow, translateReaderArticle } from './api'

function mockWindowPathname(pathname: string) {
  Object.defineProperty(globalThis, 'window', {
    value: { location: { pathname } },
    configurable: true,
  })
}

test('fetchReaderArticles includes category and saved filters', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestedUrl = ''

  mockWindowPathname('/')

  global.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input)
    return {
      json: async () => ({ success: true, data: [] }),
    } as Response
  }) as unknown as typeof fetch

  try {
    await fetchReaderArticles({ category: 'AI', date: '2026-04-01', saved: true, limit: 20 })
    assert.match(requestedUrl, /category=AI/)
    assert.match(requestedUrl, /date=2026-04-01/)
    assert.match(requestedUrl, /saved=1/)
    assert.match(requestedUrl, /limit=20/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('fetchReaderArticles includes rss source filter', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestedUrl = ''

  mockWindowPathname('/')

  global.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input)
    return {
      json: async () => ({ success: true, data: [] }),
    } as Response
  }) as unknown as typeof fetch

  try {
    await fetchReaderArticles({ source: 'rss', limit: 10 })
    assert.match(requestedUrl, /source=rss/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('createReaderFeed posts json payload', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestBody = ''

  mockWindowPathname('/')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = String(init?.body || '')
    return {
      json: async () => ({ success: true, data: { id: '1', name: 'Demo', url: 'https://example.com', category: 'AI' } }),
    } as Response
  }) as unknown as typeof fetch

  try {
    await createReaderFeed({ name: 'Demo', url: 'https://example.com', category: 'AI' })
    assert.match(requestBody, /Demo/)
    assert.match(requestBody, /https:\/\/example.com/)
    assert.match(requestBody, /AI/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('syncReaderNow triggers post request', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let method = 'GET'

  mockWindowPathname('/')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    method = String(init?.method || 'GET')
    return {
      json: async () => ({ success: true, data: { importedArticleCount: 2 } }),
    } as Response
  }) as unknown as typeof fetch

  try {
    await syncReaderNow()
    assert.equal(method, 'POST')
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('pullReaderSubscriptions triggers post request', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestedUrl = ''
  let method = 'GET'

  mockWindowPathname('/')

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input)
    method = String(init?.method || 'GET')
    return {
      json: async () => ({ success: true, data: { importedArticleCount: 3 } }),
    } as Response
  }) as unknown as typeof fetch

  try {
    await pullReaderSubscriptions()
    assert.equal(method, 'POST')
    assert.match(requestedUrl, /\/api\/system\/reader\/pull/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('translateReaderArticle triggers translate endpoint', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestedUrl = ''

  mockWindowPathname('/')

  global.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input)
    return {
      json: async () => ({ success: true, data: { id: 'a1', translatedText: '中文' } }),
    } as Response
  }) as unknown as typeof fetch

  try {
    await translateReaderArticle('a1')
    assert.match(requestedUrl, /\/api\/system\/reader\/articles\/a1\/translate/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('summarizeReaderArticle triggers summarize endpoint', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestedUrl = ''

  mockWindowPathname('/')

  global.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input)
    return {
      json: async () => ({ success: true, data: { id: 'a1', aiSummary: ['1', '2', '3'] } }),
    } as Response
  }) as unknown as typeof fetch

  try {
    await summarizeReaderArticle('a1')
    assert.match(requestedUrl, /\/api\/system\/reader\/articles\/a1\/summarize/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('clearReaderRuntimeData triggers delete request', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let method = 'GET'

  mockWindowPathname('/')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    method = String(init?.method || 'GET')
    return {
      json: async () => ({ success: true, data: undefined }),
    } as Response
  }) as unknown as typeof fetch

  try {
    await clearReaderRuntimeData()
    assert.equal(method, 'DELETE')
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})
