import test from 'node:test'
import assert from 'node:assert/strict'

import { startQuarkWebLoginFlow } from './quarkLogin'

test('startQuarkWebLoginFlow opens popup before reset request', async () => {
  const events: string[] = []
  const popup = {
    close: () => {
      events.push('close')
    }
  }

  const openWindow = ((url?: string | URL, target?: string, features?: string) => {
    events.push(`open:${String(url ?? '')}:${target ?? ''}:${features ?? ''}`)
    return popup as unknown as Window
  }) as typeof window.open

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    events.push(`fetch:${String(input)}:${init?.method ?? 'GET'}`)
    return {} as Response
  }) as typeof fetch

  await startQuarkWebLoginFlow(openWindow, fetchImpl)

  assert.deepEqual(events, [
    'open:/proxy/quark-auth/:_blank:noopener,noreferrer',
    'fetch:/api/system/netdisk/quark-auth/reset:POST'
  ])
})

test('startQuarkWebLoginFlow throws when popup is blocked', async () => {
  const openWindow = (() => null) as typeof window.open

  await assert.rejects(
    startQuarkWebLoginFlow(openWindow, fetch),
    /弹窗/
  )
})

test('startQuarkWebLoginFlow respects provided base path', async () => {
  const popup = {
    close: () => {}
  }

  let openedUrl = ''
  let requestedUrl = ''
  const openWindow = ((url?: string | URL) => {
    openedUrl = String(url ?? '')
    return popup as unknown as Window
  }) as typeof window.open
  const fetchImpl = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input)
    return {} as Response
  }) as typeof fetch

  await startQuarkWebLoginFlow(openWindow, fetchImpl, '/clawos')

  assert.equal(openedUrl, '/clawos/proxy/quark-auth/')
  assert.equal(requestedUrl, '/clawos/api/system/netdisk/quark-auth/reset')
})
