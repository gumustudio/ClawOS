import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchServerUiConfig, saveServerUiConfig } from './serverUiConfig'

function mockWindowPathname(pathname: string) {
  Object.defineProperty(globalThis, 'window', {
    value: { location: { pathname } },
    configurable: true
  })
}

test('fetchServerUiConfig reads server-side ui config', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window

  mockWindowPathname('/')

  global.fetch = (async () => ({
    json: async () => ({ success: true, data: { dockSize: 48, showWidgets: true, musicQuality: 'lossless' } })
  } as Response)) as unknown as typeof fetch

  try {
    const ui = await fetchServerUiConfig()
    assert.equal(ui.dockSize, 48)
    assert.equal(ui.showWidgets, true)
    assert.equal(ui.musicQuality, 'lossless')
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('saveServerUiConfig posts updated server-side ui config', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestBody = ''

  mockWindowPathname('/')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = String(init?.body || '')
    return {
      json: async () => ({ success: true, data: { quickNote: 'server note', dockHideDelay: 5 } })
    } as Response
  }) as unknown as typeof fetch

  try {
    const ui = await saveServerUiConfig({ quickNote: 'server note', dockHideDelay: 5 })
    assert.equal(ui.quickNote, 'server note')
    assert.equal(ui.dockHideDelay, 5)
    assert.match(requestBody, /quickNote/)
    assert.match(requestBody, /dockHideDelay/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})
