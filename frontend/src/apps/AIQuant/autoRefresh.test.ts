import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NON_TRADING_REFRESH_INTERVAL_MS,
  TRADING_REFRESH_INTERVAL_MS,
  getAutoRefreshIntervalMs,
  getMsUntilNextMarketBoundary,
} from './autoRefresh'

test('getAutoRefreshIntervalMs returns 30s during trading', () => {
  assert.equal(getAutoRefreshIntervalMs(true), TRADING_REFRESH_INTERVAL_MS)
})

test('getAutoRefreshIntervalMs returns 60s outside trading', () => {
  assert.equal(getAutoRefreshIntervalMs(false), NON_TRADING_REFRESH_INTERVAL_MS)
})

test('getMsUntilNextMarketBoundary returns delay to same-day boundary', () => {
  const now = new Date(2026, 3, 9, 14, 59, 45, 0)
  assert.equal(getMsUntilNextMarketBoundary(now), 15_000)
})

test('getMsUntilNextMarketBoundary rolls to next day first boundary', () => {
  const now = new Date(2026, 3, 9, 16, 30, 0, 0)
  const expected = new Date(2026, 3, 10, 9, 15, 0, 0).getTime() - now.getTime()
  assert.equal(getMsUntilNextMarketBoundary(now), expected)
})
