import test from 'node:test'
import assert from 'node:assert/strict'

import {
  computeBullBearRatioFromSentimentScores,
  normalizeAStockCode,
} from '../src/services/stock-analysis/data-agents'

test('normalizeAStockCode strips exchange prefix and non-digits', () => {
  assert.equal(normalizeAStockCode('SH600519'), '600519')
  assert.equal(normalizeAStockCode('sz000001'), '000001')
  assert.equal(normalizeAStockCode('BJ-430047'), '430047')
})

test('computeBullBearRatioFromSentimentScores classifies bull bear neutral buckets', () => {
  assert.deepEqual(
    computeBullBearRatioFromSentimentScores([1.2, 0.6, 0.1, -0.5, -0.9]),
    { bull: 0.4, bear: 0.4, neutral: 0.2 },
  )
})

test('computeBullBearRatioFromSentimentScores falls back to balanced default for empty input', () => {
  assert.deepEqual(
    computeBullBearRatioFromSentimentScores([]),
    { bull: 0.33, bear: 0.33, neutral: 0.34 },
  )
})

test('normalizeAStockCode returns empty string for invalid topic labels', () => {
  assert.equal(normalizeAStockCode(''), '')
  assert.equal(normalizeAStockCode('N红板'), '')
})
