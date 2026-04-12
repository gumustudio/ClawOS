import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { _testing } from '../src/services/stock-analysis/data-agents'
import { saveFactPool } from '../src/services/stock-analysis/store'
import type { DataAgentResult, FactPool, GlobalMarketSnapshot, MacroEconomicData, SocialSentimentSnapshot } from '../src/services/stock-analysis/types'

const {
  applyFactPoolBackups,
  createAgentResult,
  computeChangePercentFromSeries,
  computeSuccessRate,
  countNonNullValues,
  getRecentFactPoolBackup,
  shouldReportGlobalIndexError,
} = _testing

function createAgentLog(agentId: DataAgentResult['agentId'], dataPointCount: number, errors: string[] = []): DataAgentResult {
  return {
    agentId,
    collectedAt: '2026-04-10T10:00:00.000Z',
    dataPointCount,
    successRate: computeSuccessRate(dataPointCount, errors.length),
    elapsedMs: 123,
    errors,
  }
}

function createMacroData(overrides?: Partial<MacroEconomicData>): MacroEconomicData {
  return {
    date: '2026-04-09',
    gdpGrowth: 4.9,
    cpi: 0.8,
    pmi: 50.4,
    interestRate: 3.1,
    exchangeRateUsdCny: 7.23,
    treasuryYield10y: 2.33,
    ...overrides,
  }
}

function createGlobalSnapshot(overrides?: Partial<GlobalMarketSnapshot>): GlobalMarketSnapshot {
  return {
    collectedAt: '2026-04-09T10:00:00.000Z',
    sp500Change: null,
    nasdaqChange: null,
    hsiChange: null,
    a50FuturesChange: null,
    usdCnyRate: null,
    crudeOilChange: null,
    goldChange: null,
    us10yYieldChange: null,
    ...overrides,
  }
}

function createSentimentSnapshot(overrides?: Partial<SocialSentimentSnapshot>): SocialSentimentSnapshot {
  return {
    collectedAt: '2026-04-09T10:00:00.000Z',
    platform: 'xueqiu',
    sourceKind: 'primary_sentiment',
    summary: '测试舆情',
    hotTopics: ['机器人'],
    overallBullBearRatio: { bull: 0.5, bear: 0.2, neutral: 0.3 },
    topMentionedStocks: [{ code: '600000', mentionCount: 12, sentiment: 0.4 }],
    ...overrides,
  }
}

function createFactPoolFixture(tradeDate: string, overrides?: Partial<FactPool>): FactPool {
  return {
    updatedAt: '2026-04-09T16:00:00.000Z',
    tradeDate,
    macroData: createMacroData(),
    policyEvents: [],
    companyAnnouncements: [],
    industryNews: [],
    socialSentiment: [
      createSentimentSnapshot(),
      createSentimentSnapshot({ platform: 'weibo', summary: '微博舆情', hotTopics: ['算力'] }),
      createSentimentSnapshot({ platform: 'guba', sourceKind: 'supplementary_heat', summary: '股吧热榜', hotTopics: ['黄金'] }),
    ],
    globalMarkets: createGlobalSnapshot({ sp500Change: 1.2, nasdaqChange: 1.8, hsiChange: -0.4, usdCnyRate: 7.21 }),
    priceVolumeExtras: null,
    dataQuality: null,
    agentLogs: [],
    ...overrides,
  }
}

test('shouldReportGlobalIndexError returns false when fallback fills core indices', () => {
  const snapshot = createGlobalSnapshot({ sp500Change: 1.1, nasdaqChange: 1.6, hsiChange: -0.3 })
  assert.equal(shouldReportGlobalIndexError(snapshot, true), false)
})

test('shouldReportGlobalIndexError returns true when all core indices remain missing', () => {
  const snapshot = createGlobalSnapshot({ a50FuturesChange: 0.4, goldChange: 0.8 })
  assert.equal(shouldReportGlobalIndexError(snapshot, true), true)
})

test('shouldReportGlobalIndexError returns false when Eastmoney source itself is available', () => {
  const snapshot = createGlobalSnapshot()
  assert.equal(shouldReportGlobalIndexError(snapshot, false), false)
})

test('createAgentResult treats partial data as partial success instead of zero', () => {
  const result = createAgentResult('macro_economy', Date.now() - 5, 1, ['AKShare-macro 失败', 'AKShare-lpr 失败'])
  assert.equal(result.successRate, 1 / 3)
})

test('computeChangePercentFromSeries skips null gaps and uses latest two valid closes', () => {
  const change = computeChangePercentFromSeries([100, null, 102, null, 105])
  assert.equal(change, 2.9412)
})

test('createAgentResult returns zero success when agent has neither data nor errors', () => {
  const result = createAgentResult('global_markets', Date.now() - 5, 0, [])
  assert.equal(result.successRate, 0)
})

test('countNonNullValues only counts defined values', () => {
  assert.equal(countNonNullValues([0, null, undefined, '', false, 1]), 4)
})

test('getRecentFactPoolBackup skips current trade date and returns latest prior snapshot', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-stock-analysis-factpool-'))
  const stockAnalysisDir = path.join(tempRoot, 'AI炒股分析')

  await saveFactPool(stockAnalysisDir, createFactPoolFixture('2026-04-08'))
  await saveFactPool(stockAnalysisDir, createFactPoolFixture('2026-04-09'))
  await saveFactPool(stockAnalysisDir, createFactPoolFixture('2026-04-10'))

  const backup = await getRecentFactPoolBackup(stockAnalysisDir, '2026-04-10')
  assert.ok(backup)
  assert.equal(backup.tradeDate, '2026-04-09')
})

test('applyFactPoolBackups restores macro snapshot when live macro data is nearly empty', () => {
  const macroResult = {
    data: createMacroData({ cpi: null, pmi: null, interestRate: null, exchangeRateUsdCny: null, treasuryYield10y: null }),
    log: createAgentLog('macro_economy', 1, ['AKShare-macro 失败']),
  }
  const sentimentResult = {
    data: [createSentimentSnapshot(), createSentimentSnapshot({ platform: 'weibo' }), createSentimentSnapshot({ platform: 'guba' })],
    log: createAgentLog('social_sentiment', 3),
  }
  const globalResult = {
    data: createGlobalSnapshot({ sp500Change: 1.0 }),
    log: createAgentLog('global_markets', 1),
  }

  applyFactPoolBackups('2026-04-10', createFactPoolFixture('2026-04-09'), {
    macroResult,
    sentimentResult,
    globalResult,
  })

  assert.equal(macroResult.data?.date, '2026-04-10')
  assert.equal(macroResult.data?.gdpGrowth, 4.9)
  assert.equal(macroResult.log.dataPointCount, 6)
  assert.ok(macroResult.log.errors.some((item) => item.includes('已回退到最近成功宏观快照(2026-04-09)')))
  assert.equal(macroResult.log.successRate, 6 / 8)
})

test('applyFactPoolBackups restores social sentiment and preserves audit error', () => {
  const macroResult = {
    data: createMacroData(),
    log: createAgentLog('macro_economy', 6),
  }
  const sentimentResult = {
    data: [createSentimentSnapshot({ hotTopics: ['仅一条'] })],
    log: createAgentLog('social_sentiment', 1, ['微博舆情报告无数据']),
  }
  const globalResult = {
    data: createGlobalSnapshot({ sp500Change: 1.0 }),
    log: createAgentLog('global_markets', 1),
  }

  applyFactPoolBackups('2026-04-10', createFactPoolFixture('2026-04-09'), {
    macroResult,
    sentimentResult,
    globalResult,
  })

  assert.equal(sentimentResult.data.length, 3)
  assert.ok(sentimentResult.log.errors.includes('微博舆情报告无数据'))
  assert.ok(sentimentResult.log.errors.some((item) => item.includes('已回退到最近成功社交舆情快照(2026-04-09)')))
  assert.equal(sentimentResult.log.successRate, 3 / 5)
})

test('applyFactPoolBackups restores global markets when live snapshot is empty', () => {
  const macroResult = {
    data: createMacroData(),
    log: createAgentLog('macro_economy', 6),
  }
  const sentimentResult = {
    data: [createSentimentSnapshot(), createSentimentSnapshot({ platform: 'weibo' }), createSentimentSnapshot({ platform: 'guba' })],
    log: createAgentLog('social_sentiment', 3),
  }
  const globalResult = {
    data: null,
    log: createAgentLog('global_markets', 0, ['所有全球市场数据源均失败']),
  }

  applyFactPoolBackups('2026-04-10', createFactPoolFixture('2026-04-09'), {
    macroResult,
    sentimentResult,
    globalResult,
  })

  assert.equal(globalResult.data?.sp500Change, 1.2)
  assert.equal(globalResult.log.dataPointCount, 4)
  assert.ok(globalResult.log.errors.includes('所有全球市场数据源均失败'))
  assert.ok(globalResult.log.errors.some((item) => item.includes('已回退到最近成功全球市场快照(2026-04-09)')))
  assert.equal(globalResult.log.successRate, 4 / 6)
})
