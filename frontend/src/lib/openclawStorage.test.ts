import test from 'node:test'
import assert from 'node:assert/strict'

import { buildEmbeddedOpenClawIframeUrl, primeEmbeddedOpenClawStorage } from './openclawStorage'

class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length() {
    return this.store.size
  }

  clear() {
    this.store.clear()
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
}

function mockWindow() {
  const localStorage = new MemoryStorage()
  const sessionStorage = new MemoryStorage()
  const windowMock = {
    location: {
      protocol: 'https:',
      host: 'clawos.example.com',
      pathname: '/clawos/'
    },
    localStorage,
    sessionStorage
  } as unknown as Window & typeof globalThis

  Object.defineProperty(globalThis, 'window', {
    value: windowMock,
    configurable: true
  })

  return { windowMock, localStorage, sessionStorage }
}

test('primeEmbeddedOpenClawStorage seeds gateway-scoped settings from fallback config', async () => {
  const originalWindow = (globalThis as { window?: Window }).window
  const originalFetch = globalThis.fetch
  const { localStorage } = mockWindow()

  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, data: {} })) as Response

  localStorage.setItem('openclaw.control.settings.v1', JSON.stringify({ theme: 'dark' }))

  try {
    await primeEmbeddedOpenClawStorage('wss://clawos.example.com/clawos/proxy/openclaw/')

    const stored = JSON.parse(
      localStorage.getItem('openclaw.control.settings.v1:wss://clawos.example.com/clawos/proxy/openclaw') || '{}'
    ) as { theme?: string; gatewayUrl?: string }

    assert.equal(stored.theme, 'dark')
    assert.equal(stored.gatewayUrl, 'wss://clawos.example.com/clawos/proxy/openclaw')
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('primeEmbeddedOpenClawStorage copies session token without overwriting existing scoped token', async () => {
  const originalWindow = (globalThis as { window?: Window }).window
  const originalFetch = globalThis.fetch
  const { sessionStorage } = mockWindow()

  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, data: {} })) as Response

  sessionStorage.setItem('openclaw.control.token.v1', 'fallback-token')
  sessionStorage.setItem('openclaw.control.token.v1:wss://clawos.example.com/clawos/proxy/openclaw', 'existing-token')

  try {
    await primeEmbeddedOpenClawStorage('wss://clawos.example.com/clawos/proxy/openclaw')

    assert.equal(
      sessionStorage.getItem('openclaw.control.token.v1:wss://clawos.example.com/clawos/proxy/openclaw'),
      'existing-token'
    )
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('primeEmbeddedOpenClawStorage copies fallback session token when scoped token is missing', async () => {
  const originalWindow = (globalThis as { window?: Window }).window
  const originalFetch = globalThis.fetch
  const { sessionStorage } = mockWindow()

  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, data: {} })) as Response

  sessionStorage.setItem('openclaw.control.token.v1', 'fallback-token')

  try {
    await primeEmbeddedOpenClawStorage('wss://clawos.example.com/clawos/proxy/openclaw')

    assert.equal(
      sessionStorage.getItem('openclaw.control.token.v1:wss://clawos.example.com/clawos/proxy/openclaw'),
      'fallback-token'
    )
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('primeEmbeddedOpenClawStorage normalizes equivalent gateway urls to one scoped token key', async () => {
  const originalWindow = (globalThis as { window?: Window }).window
  const originalFetch = globalThis.fetch
  const { sessionStorage } = mockWindow()

  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, data: {} })) as Response

  try {
    await primeEmbeddedOpenClawStorage('wss://clawos.example.com/clawos/proxy/openclaw/')
    sessionStorage.setItem('openclaw.control.token.v1:wss://clawos.example.com/clawos/proxy/openclaw', 'scoped-token')

    await primeEmbeddedOpenClawStorage('wss://clawos.example.com/clawos/proxy/openclaw')

    assert.equal(
      sessionStorage.getItem('openclaw.control.token.v1:wss://clawos.example.com/clawos/proxy/openclaw'),
      'scoped-token'
    )
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('primeEmbeddedOpenClawStorage prefers bootstrap token from same-origin api', async () => {
  const originalWindow = (globalThis as { window?: Window }).window
  const originalFetch = globalThis.fetch
  const { sessionStorage } = mockWindow()

  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: { token: 'bootstrap-token' } })) as Response

  try {
    await primeEmbeddedOpenClawStorage('wss://clawos.example.com/clawos/proxy/openclaw')

    assert.equal(sessionStorage.getItem('openclaw.control.token.v1'), 'bootstrap-token')
    assert.equal(
      sessionStorage.getItem('openclaw.control.token.v1:wss://clawos.example.com/clawos/proxy/openclaw'),
      'bootstrap-token'
    )
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('primeEmbeddedOpenClawStorage returns the resolved scoped token', async () => {
  const originalWindow = (globalThis as { window?: Window }).window
  const originalFetch = globalThis.fetch
  mockWindow()

  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: { token: 'bootstrap-token' } })) as Response

  try {
    const token = await primeEmbeddedOpenClawStorage('wss://clawos.example.com/clawos/proxy/openclaw')

    assert.equal(token, 'bootstrap-token')
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('buildEmbeddedOpenClawIframeUrl keeps token in hash fragment', () => {
  const originalWindow = (globalThis as { window?: Window }).window
  mockWindow()

  try {
    const iframeUrl = buildEmbeddedOpenClawIframeUrl(
      'wss://clawos.example.com/clawos/proxy/openclaw/',
      'bootstrap-token'
    )

    assert.equal(
      iframeUrl,
      '/clawos/proxy/openclaw/?gatewayUrl=wss%3A%2F%2Fclawos.example.com%2Fclawos%2Fproxy%2Fopenclaw#token=bootstrap-token'
    )
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})
