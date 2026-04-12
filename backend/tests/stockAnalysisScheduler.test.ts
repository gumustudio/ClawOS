import test from 'node:test'
import assert from 'node:assert/strict'

import { _testing } from '../src/services/stock-analysis/service'

const { assertWithinPostMarketWindow, POST_MARKET_BATCH_WINDOW_MS } = _testing

test('post-market batch window defaults to 3 hours', () => {
  assert.equal(POST_MARKET_BATCH_WINDOW_MS, 3 * 60 * 60 * 1000)
})

test('assertWithinPostMarketWindow allows execution within window', () => {
  const startedAt = Date.now() - 5_000
  assert.doesNotThrow(() => {
    assertWithinPostMarketWindow(startedAt, 10_000, 'Phase 4')
  })
})

test('assertWithinPostMarketWindow stops execution after deadline', () => {
  const startedAt = Date.now() - 11 * 60_000
  assert.throws(
    () => assertWithinPostMarketWindow(startedAt, 10 * 60_000, 'Phase 5'),
    /盘后流程超过 10 分钟窗口，已在Phase 5阶段停止/,
  )
})
