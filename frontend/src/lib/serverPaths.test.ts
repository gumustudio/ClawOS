import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchServerPaths, saveServerPaths } from './serverPaths'

function mockWindowPathname(pathname: string) {
  Object.defineProperty(globalThis, 'window', {
    value: { location: { pathname } },
    configurable: true
  })
}

test('fetchServerPaths reads server-side path config', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window

  mockWindowPathname('/')

  global.fetch = (async () => ({
    json: async () => ({ success: true, data: { notesDir: '/mock/home/文档/随手小记', readerDir: '/mock/home/文档/RSS资讯', stockAnalysisDir: '/mock/home/文档/AI炒股分析' } })
  } as Response)) as unknown as typeof fetch

  try {
    const paths = await fetchServerPaths()
    assert.equal(paths.notesDir, '/mock/home/文档/随手小记')
    assert.equal(paths.readerDir, '/mock/home/文档/RSS资讯')
    assert.equal(paths.stockAnalysisDir, '/mock/home/文档/AI炒股分析')
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})

test('saveServerPaths posts updated server-side path config', async () => {
  const originalFetch = global.fetch
  const originalWindow = (globalThis as { window?: Window }).window
  let requestBody = ''

  mockWindowPathname('/')

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = String(init?.body || '')
    return {
      json: async () => ({ success: true, data: { videoDownloadsDir: '/mock/home/视频', readerDir: '/mock/home/文档/RSS资讯', stockAnalysisDir: '/mock/home/文档/AI炒股分析' } })
    } as Response
  }) as unknown as typeof fetch

  try {
    const paths = await saveServerPaths({ videoDownloadsDir: '/mock/home/视频' })
    assert.equal(paths.videoDownloadsDir, '/mock/home/视频')
    assert.match(requestBody, /videoDownloadsDir/)
  } finally {
    global.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  }
})
