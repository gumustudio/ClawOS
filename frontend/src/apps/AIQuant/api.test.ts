import test from 'node:test'
import assert from 'node:assert/strict'

import {
  confirmStockAnalysisSignal,
  fetchStockAnalysisHealth,
  fetchStockAnalysisOverview,
  refreshStockAnalysisStockPool,
  runStockAnalysisDaily,
} from './api'

function mockWindowPathname(pathname: string) {
  Object.defineProperty(globalThis, 'window', {
    value: { location: { pathname } },
    configurable: true,
  })
}

/** 构建包含 headers 的 mock Response */
function mockJsonResponse(data: unknown): Response {
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
  } as Response
}

test('fetchStockAnalysisOverview requests overview endpoint', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestedUrl = ''

  mockWindowPathname('/')

  global.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input)
    return mockJsonResponse({ success: true, data: { topSignals: [], positions: [], recentTrades: [], watchLogs: [], weeklySummary: [], modelGroupPerformance: [], stats: {}, marketState: {}, systemStatus: {} } })
  }) as unknown as typeof fetch

  try {
    await fetchStockAnalysisOverview()
    assert.match(requestedUrl, /\/api\/system\/stock-analysis\/overview/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('fetchStockAnalysisHealth requests health endpoint', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestedUrl = ''

  mockWindowPathname('/')

  global.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input)
    return mockJsonResponse({ success: true, data: { ok: true, dataState: 'ready', runState: 'success', staleReasons: [], isUsingFallback: false } })
  }) as unknown as typeof fetch

  try {
    await fetchStockAnalysisHealth()
    assert.match(requestedUrl, /\/api\/system\/stock-analysis\/health/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('runStockAnalysisDaily uses post request', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let method = 'GET'

  mockWindowPathname('/')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    method = String(init?.method || 'GET')
    return mockJsonResponse({ success: true, data: { signalCount: 1 } })
  }) as unknown as typeof fetch

  try {
    await runStockAnalysisDaily()
    assert.equal(method, 'POST')
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('refreshStockAnalysisStockPool uses refresh endpoint', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestedUrl = ''

  mockWindowPathname('/')

  global.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input)
    return mockJsonResponse({ success: true, data: { count: 500 } })
  }) as unknown as typeof fetch

  try {
    await refreshStockAnalysisStockPool()
    assert.match(requestedUrl, /\/api\/system\/stock-analysis\/stock-pool\/refresh/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('confirmStockAnalysisSignal posts payload', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestBody = ''

  mockWindowPathname('/')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = String(init?.body || '')
    return mockJsonResponse({ success: true, data: { id: 'position-1' } })
  }) as unknown as typeof fetch

  try {
    await confirmStockAnalysisSignal('signal-1', { quantity: 200, weight: 0.2, note: '测试确认' })
    assert.match(requestBody, /200/)
    assert.match(requestBody, /0\.2/)
    assert.match(requestBody, /测试确认/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})
