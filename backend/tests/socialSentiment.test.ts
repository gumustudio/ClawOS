import test from 'node:test'
import assert from 'node:assert/strict'

import {
  aggregateSocialSentiment,
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

test('aggregateSocialSentiment ignores pure heat lists such as Eastmoney hot stocks', () => {
  const aggregated = aggregateSocialSentiment([
    {
      collectedAt: '2026-04-28T08:00:00.000Z',
      platform: 'eastmoney_hot',
      sourceKind: 'supplementary_heat',
      contributesToMarketSentiment: false,
      summary: '东方财富热股中性热点',
      hotTopics: ['恒工精密'],
      overallBullBearRatio: { bull: 1, bear: 0, neutral: 0 },
      topMentionedStocks: [{ code: '301261', mentionCount: 1, sentiment: 0 }],
    },
    {
      collectedAt: '2026-04-28T08:00:01.000Z',
      platform: 'weibo',
      sourceKind: 'primary_sentiment',
      contributesToMarketSentiment: true,
      summary: '微博偏空',
      hotTopics: ['比亚迪'],
      overallBullBearRatio: { bull: 0.25, bear: 0.6, neutral: 0.15 },
      topMentionedStocks: [],
    },
  ])

  assert.equal(aggregated.sourceCount, 1)
  assert.equal(aggregated.bull, 0.25)
  assert.equal(aggregated.bear, 0.6)
  assert.equal(aggregated.score, -0.35)
})

test('aggregateSocialSentiment combines multiple valid channels with lower weight for supplementary breadth', () => {
  const aggregated = aggregateSocialSentiment([
    {
      collectedAt: '2026-04-28T08:00:00.000Z',
      platform: 'xueqiu',
      sourceKind: 'primary_sentiment',
      contributesToMarketSentiment: true,
      summary: '雪球偏空',
      hotTopics: ['贵州茅台'],
      overallBullBearRatio: { bull: 0.03, bear: 0.15, neutral: 0.82 },
      topMentionedStocks: [],
    },
    {
      collectedAt: '2026-04-28T08:00:01.000Z',
      platform: 'weibo',
      sourceKind: 'primary_sentiment',
      contributesToMarketSentiment: true,
      summary: '微博偏空',
      hotTopics: ['比亚迪'],
      overallBullBearRatio: { bull: 0.25, bear: 0.6, neutral: 0.15 },
      topMentionedStocks: [],
    },
    {
      collectedAt: '2026-04-28T08:00:02.000Z',
      platform: 'eastmoney_hot',
      sourceKind: 'supplementary_heat',
      contributesToMarketSentiment: true,
      summary: '千股千评偏空',
      hotTopics: ['全市场'],
      overallBullBearRatio: { bull: 0.32, bear: 0.66, neutral: 0.02 },
      topMentionedStocks: [],
    },
  ])

  assert.equal(aggregated.sourceCount, 3)
  assert.equal(aggregated.bull, 0.18)
  assert.equal(aggregated.bear, 0.43)
  assert.equal(aggregated.score, -0.256)
})
