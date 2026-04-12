import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

function mockTradingTime(isoString: string) {
  const RealDate = Date
  class MockDate extends RealDate {
    constructor(value?: string | number | Date) {
      super(value ?? isoString)
    }

    static override now() {
      return new RealDate(isoString).getTime()
    }
  }
  global.Date = MockDate as DateConstructor
  return () => {
    global.Date = RealDate
  }
}

async function setupTradingFixture() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-stock-analysis-trading-'))
  const stockAnalysisDir = path.join(tempRoot, 'AI炒股分析')
  await fs.mkdir(path.join(stockAnalysisDir, 'config'), { recursive: true })
  await fs.mkdir(path.join(stockAnalysisDir, 'portfolio'), { recursive: true })
  await fs.mkdir(path.join(stockAnalysisDir, 'journal'), { recursive: true })
  await fs.mkdir(path.join(stockAnalysisDir, 'reviews'), { recursive: true })
  await fs.mkdir(path.join(stockAnalysisDir, 'risk'), { recursive: true })
  await fs.writeFile(path.join(stockAnalysisDir, 'portfolio', 'positions.json'), '[]\n', 'utf8')
  await fs.writeFile(path.join(stockAnalysisDir, 'journal', 'trades.json'), '[]\n', 'utf8')
  await fs.writeFile(path.join(stockAnalysisDir, 'journal', 'reviews.json'), '[]\n', 'utf8')
  await fs.writeFile(path.join(stockAnalysisDir, 'risk', 'events.json'), '[]\n', 'utf8')
  await fs.writeFile(path.join(stockAnalysisDir, 'config', 'strategy.json'), JSON.stringify({
    maxPositions: 3,
    maxSinglePosition: 0.3,
    maxTotalPosition: 0.85,
    stopLossPercent: 3,
    takeProfitPercent1: 3,
    takeProfitPercent2: 6,
    maxHoldDays: 20,
    minTurnoverAmount20d: 50000000,
    minAmplitude20d: 5,
    maxContinuousDeclineDays: 15,
    marketThresholds: {
      bull_trend: { minCompositeScore: 72, minExpertConsensus: 0.55, minTechnicalScore: 62, minQuantScore: 58 },
      bear_trend: { minCompositeScore: 80, minExpertConsensus: 0.72, minTechnicalScore: 75, minQuantScore: 70 },
      high_volatility: { minCompositeScore: 78, minExpertConsensus: 0.68, minTechnicalScore: 72, minQuantScore: 68 },
      low_volatility_range: { minCompositeScore: 75, minExpertConsensus: 0.60, minTechnicalScore: 68, minQuantScore: 63 },
      normal_range: { minCompositeScore: 76, minExpertConsensus: 0.63, minTechnicalScore: 70, minQuantScore: 65 },
    },
    fusionWeightsByRegime: {
      bull_trend: { expert: 0.35, technical: 0.35, quant: 0.30 },
      bear_trend: { expert: 0.40, technical: 0.25, quant: 0.35 },
      high_volatility: { expert: 0.30, technical: 0.40, quant: 0.30 },
      low_volatility_range: { expert: 0.35, technical: 0.30, quant: 0.35 },
      normal_range: { expert: 0.35, technical: 0.35, quant: 0.30 },
    },
    lowLiquidityGuardrail: {
      volumePercentileThreshold: 0.15,
      crisisRisingRatioThreshold: 0.35,
      scorePenalty: 4,
      maxPositionRatio: 0.65,
      crisisMaxPositionRatio: 0.35,
    },
    trailingStop: {
      activationPercent: 4,
      pullbackPercent: 2.5,
    },
    portfolioRiskLimits: {
      maxDailyLossPercent: 3,
      maxWeeklyLossPercent: 6,
      maxMonthlyLossPercent: 10,
      maxDrawdownPercent: 12,
    },
  }, null, 2), 'utf8')
  await fs.writeFile(path.join(stockAnalysisDir, 'config', 'runtime-status.json'), JSON.stringify({
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    stockPoolRefreshedAt: null,
    latestSignalDate: null,
    runState: 'idle',
    currentRun: null,
    quoteCacheAt: null,
    indexHistoryCacheAt: null,
    latestSuccessfulSignalDate: null,
    isUsingFallback: false,
    staleReasons: [],
    postMarketAt: null,
    riskControl: {
      paused: false,
      pauseReason: null,
      pausedAt: null,
      dailyLossPercent: 0,
      weeklyLossPercent: 0,
      monthlyLossPercent: 0,
      maxDrawdownPercent: 0,
      dailyLossBreached: false,
      weeklyLossBreached: false,
      monthlyLossBreached: false,
      maxDrawdownBreached: false,
      lastCheckedAt: null,
    },
  }, null, 2), 'utf8')
  return { tempRoot, stockAnalysisDir }
}

test('same-day position cannot be closed because of T+1 rule', async () => {
  const { tempRoot, stockAnalysisDir } = await setupTradingFixture()
  const restoreDate = mockTradingTime('2026-04-10T10:00:00.000+08:00')
  try {
    const today = new Date().toISOString()
    await fs.writeFile(path.join(stockAnalysisDir, 'portfolio', 'positions.json'), JSON.stringify([
      {
        id: 'position-1',
        code: '600519',
        name: '贵州茅台',
        openedAt: today,
        openDate: today.slice(0, 10),
        sourceSignalId: 'signal-1',
        quantity: 100,
        weight: 0.2,
        costPrice: 100,
        currentPrice: 101,
        returnPercent: 1,
        holdingDays: 1,
        stopLossPrice: 97,
        takeProfitPrice1: 103,
        takeProfitPrice2: 106,
        trailingStopEnabled: true,
        highestPriceSinceOpen: 101,
        action: 'hold',
        actionReason: '新开仓',
      },
    ], null, 2), 'utf8')

    const service = await import(`../src/services/stock-analysis/service?ts=${Date.now()}`)
    await assert.rejects(
      service.closeStockAnalysisPosition(stockAnalysisDir, 'position-1', { quantity: 100, price: 101 }),
      /T\+1/,
    )
  } finally {
    restoreDate()
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('same-day position cannot be reduced because of T+1 rule', async () => {
  const { tempRoot, stockAnalysisDir } = await setupTradingFixture()
  const restoreDate = mockTradingTime('2026-04-10T10:00:00.000+08:00')
  try {
    const today = new Date().toISOString()
    await fs.writeFile(path.join(stockAnalysisDir, 'portfolio', 'positions.json'), JSON.stringify([
      {
        id: 'position-1',
        code: '600519',
        name: '贵州茅台',
        openedAt: today,
        openDate: today.slice(0, 10),
        sourceSignalId: 'signal-1',
        quantity: 200,
        weight: 0.2,
        costPrice: 100,
        currentPrice: 101,
        returnPercent: 1,
        holdingDays: 1,
        stopLossPrice: 97,
        takeProfitPrice1: 103,
        takeProfitPrice2: 106,
        trailingStopEnabled: true,
        highestPriceSinceOpen: 101,
        action: 'hold',
        actionReason: '新开仓',
      },
    ], null, 2), 'utf8')

    const service = await import(`../src/services/stock-analysis/service?ts=${Date.now()}`)
    await assert.rejects(
      service.reduceStockAnalysisPosition(stockAnalysisDir, 'position-1', { quantity: 100, price: 101 }),
      /T\+1/,
    )
  } finally {
    restoreDate()
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})
