import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type {
  StockAnalysisKlinePoint,
  StockAnalysisSpotQuote,
  StockAnalysisWatchlistCandidate,
  StockAnalysisStrategyConfig,
  StockAnalysisMarketState,
  StockAnalysisStockSnapshot,
  StockAnalysisTradeRecord,
} from '../src/services/stock-analysis/types'
import { _testing } from '../src/services/stock-analysis/service'
import { DEFAULT_STOCK_ANALYSIS_CONFIG, saveStockAnalysisTrades } from '../src/services/stock-analysis/store'

const {
  buildIndustryStrengthMap,
  buildIndustryTrendMap,
  buildCrossSectionalMomentumMap,
  applyCrossSectionalMomentumRanks,
  buildSnapshot,
  buildTechnicalScore,
  buildQuantScore,
  buildCandidatePoolScore,
  buildSignal,
  getAdjustedFusionWeights,
  adjustConvictionThresholds,
  calculateRsi,
  calculateMacd,
  calculateAtr,
} = _testing

function createHistory(closes: number[], volumes?: number[]): StockAnalysisKlinePoint[] {
  return closes.map((close, index) => {
    const previousClose = closes[Math.max(0, index - 1)]
    const open = index === 0 ? close : previousClose
    const high = Math.max(open, close) * 1.01
    const low = Math.min(open, close) * 0.99
    const volume = volumes?.[index] ?? (1_000_000 + index * 20_000)
    return {
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      open,
      close,
      high,
      low,
      volume,
      turnover: close * volume,
      amplitude: ((high - low) / close) * 100,
      changePercent: previousClose === 0 ? 0 : ((close - previousClose) / previousClose) * 100,
      changeAmount: close - previousClose,
      turnoverRate: 3 + (index % 4),
    }
  })
}

async function createTempStockAnalysisDir(): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-scoring-'))
  const dir = path.join(tempRoot, 'AI炒股分析')
  await fs.mkdir(dir, { recursive: true })
  return dir
}

function createTrade(index: number, pnlPercent: number): StockAnalysisTradeRecord {
  return {
    id: `trade-${index}`,
    action: 'sell',
    code: '600519',
    name: '贵州茅台',
    tradeDate: `2026-04-${String(Math.max(1, 28 - index)).padStart(2, '0')}`,
    price: 100,
    quantity: 1,
    weight: 0.1,
    sourceSignalId: null,
    sourceDecision: 'system',
    note: 'test',
    relatedPositionId: null,
    pnlPercent,
  }
}

test('getAdjustedFusionWeights keeps expert stream meaningfully represented', () => {
  const adjusted = getAdjustedFusionWeights(
    { expert: 0.35, technical: 0.35, quant: 0.30 },
    {
      updatedAt: '2026-04-28T00:00:00.000Z',
      sampleCount: 10,
      dimensionAccuracy: { expert: 0.3, technical: 0.6, quant: 0.7 },
      adjustmentFactors: { expert: -0.2, technical: 0.05, quant: 0.15 },
      history: [],
    },
  )

  assert.ok(adjusted.expert >= 0.32)
})

test('buildSignal penalizes overheated momentum names and downgrades multi-factor chase risk', async () => {
  const hotSnapshot: StockAnalysisStockSnapshot = {
    code: '600487',
    name: '亨通光电',
    market: 'sh' as const,
    exchange: 'SSE',
    sector: '通信',
    latestPrice: 71.38,
    changePercent: 2.65,
    open: 69.54,
    high: 74.49,
    low: 68.9,
    previousClose: 69.54,
    turnoverRate: 10.2,
    totalMarketCap: 1760,
    circulatingMarketCap: 1745,
    averageTurnoverAmount20d: 10_000_000_000,
    amplitude20d: 7.39,
    declineDays20d: 0,
    return5d: 24.96,
    return20d: 45.24,
    return60d: 148.62,
    return120d: 217.68,
    momentumRank20d: 0.98,
    momentumRank60d: 1,
    volumeBreakout: 1.225,
    volatility20d: 73.6,
    volatilityRank: 0.0072,
    pricePosition20d: 1,
    movingAverage5: 65.11,
    movingAverage20: 57.21,
    movingAverage60: 46.9,
    movingAverage120: 34.66,
    movingAverage20Slope: 9.65,
    movingAverage60Slope: 7.32,
    rsi14: 74.46,
    macdLine: 4.87,
    macdSignal: 3.69,
    macdHistogram: 1.18,
    atr14: 3.87,
    atrPercent: 5.57,
    distanceToResistance1: 2.53,
    distanceToSupport1: 6.37,
    industryStrength: 0.8,
    industryBreadth: 0.7,
    industryReturn20d: 30,
    industryReturn60d: 60,
    industryTrendStrength: 0.9,
    scoreReason: [],
  }
  const signal = await buildSignal(hotSnapshot, createMarketState({ trend: 'range_bound', sentiment: 'pessimistic', risingRatio: 0.37 }), DEFAULT_STOCK_ANALYSIS_CONFIG, null, null, null, undefined, undefined, undefined, undefined, undefined, null)

  assert.equal(signal.action, 'watch')
  assert.ok(signal.watchReasons.some((reason) => reason.includes('追高风险')))
})

test('buildSignal downgrades only extremely low expert consensus instead of every below-threshold consensus', async () => {
  const snapshot = createSyntheticSnapshot({ return20d: 18, pricePosition20d: 0.82, rsi14: 62 })
  const normalLowConsensusSignal = await buildSignal(snapshot, createMarketState(), DEFAULT_STOCK_ANALYSIS_CONFIG, null, null, null, undefined, undefined, undefined, undefined, undefined, null)
  assert.notEqual(normalLowConsensusSignal.action, 'none')

  const extremeLowSnapshot = createSyntheticSnapshot({ return20d: -30, return60d: -40, momentumRank20d: 0.05, momentumRank60d: 0.05, pricePosition20d: 0.2, rsi14: 32 })
  const extremeLowSignal = await buildSignal(extremeLowSnapshot, createMarketState(), DEFAULT_STOCK_ANALYSIS_CONFIG, null, null, null, undefined, undefined, undefined, undefined, undefined, null)
  assert.equal(extremeLowSignal.action, 'watch')
  assert.ok(extremeLowSignal.watchReasons.some((reason) => reason.includes('极低')))
})

test('weak breadth or pessimistic bull trend uses normal-range thresholds', async () => {
  const snapshot = createSyntheticSnapshot({ return20d: 12, pricePosition20d: 0.75, rsi14: 58 })
  const signal = await buildSignal(snapshot, createMarketState({ trend: 'bull_trend', sentiment: 'pessimistic', risingRatio: 0.37 }), DEFAULT_STOCK_ANALYSIS_CONFIG, null, null, null, undefined, undefined, undefined, undefined, undefined, null)

  assert.equal(signal.thresholds.minCompositeScore, DEFAULT_STOCK_ANALYSIS_CONFIG.marketThresholds.normal_range.minCompositeScore)
  assert.ok(signal.watchReasons.some((reason) => reason.includes('上涨广度/情绪走弱')))
})

test('adjustConvictionThresholds skips small samples and restores bull floor before loosening', async () => {
  const smallSampleDir = await createTempStockAnalysisDir()
  await saveStockAnalysisTrades(smallSampleDir, Array.from({ length: 10 }, (_, index) => createTrade(index, 5)))
  const smallSampleConfig: StockAnalysisStrategyConfig = structuredClone(DEFAULT_STOCK_ANALYSIS_CONFIG)
  smallSampleConfig.marketThresholds.bull_trend.minCompositeScore = 60
  const skipped = await adjustConvictionThresholds(smallSampleDir, smallSampleConfig, createMarketState({ trend: 'bull_trend' }))
  assert.equal(skipped, null)
  assert.equal(smallSampleConfig.marketThresholds.bull_trend.minCompositeScore, 60)

  const fullSampleDir = await createTempStockAnalysisDir()
  await saveStockAnalysisTrades(fullSampleDir, Array.from({ length: 25 }, (_, index) => createTrade(index, 5)))
  const config: StockAnalysisStrategyConfig = structuredClone(DEFAULT_STOCK_ANALYSIS_CONFIG)
  config.marketThresholds.bull_trend.minCompositeScore = 60
  const adjusted = await adjustConvictionThresholds(fullSampleDir, config, createMarketState({ trend: 'bull_trend' }))
  assert.equal(adjusted?.newMinCompositeScore, 70)
  assert.equal(config.marketThresholds.bull_trend.minCompositeScore, 70)
})

function createSyntheticSnapshot(overrides: Partial<StockAnalysisStockSnapshot> = {}): StockAnalysisStockSnapshot {
  return {
    code: '600519',
    name: '贵州茅台',
    market: 'sh',
    exchange: 'SSE',
    sector: '酿酒行业',
    latestPrice: 100,
    changePercent: 1,
    open: 99,
    high: 102,
    low: 98,
    previousClose: 99,
    turnoverRate: 5,
    totalMarketCap: 1_500_000_000_000,
    circulatingMarketCap: 1_500_000_000_000,
    averageTurnoverAmount20d: 1_000_000_000,
    amplitude20d: 12,
    declineDays20d: 2,
    return5d: 4,
    return20d: 16,
    return60d: 35,
    return120d: 50,
    momentumRank20d: 0.8,
    momentumRank60d: 0.82,
    volumeBreakout: 1.1,
    volatility20d: 25,
    volatilityRank: 0.4,
    pricePosition20d: 0.75,
    movingAverage5: 100,
    movingAverage20: 94,
    movingAverage60: 88,
    movingAverage120: 80,
    movingAverage20Slope: 1.5,
    movingAverage60Slope: 1,
    rsi14: 58,
    macdLine: 1.2,
    macdSignal: 0.9,
    macdHistogram: 0.3,
    atr14: 2,
    atrPercent: 2,
    distanceToResistance1: 8,
    distanceToSupport1: 6,
    industryStrength: 0.7,
    industryBreadth: 0.65,
    industryReturn20d: 15,
    industryReturn60d: 25,
    industryTrendStrength: 0.7,
    scoreReason: [],
    ...overrides,
  }
}

function createCandidate(): StockAnalysisWatchlistCandidate {
  return {
    code: '600519',
    name: '贵州茅台',
    market: 'sh',
    exchange: 'SSE',
    industryName: '酿酒行业',
  }
}

function createQuote(latestPrice: number, industryName = '酿酒行业'): StockAnalysisSpotQuote {
  return {
    code: '600519',
    name: '贵州茅台',
    industryName,
    latestPrice,
    changePercent: 1.2,
    turnoverRate: 4.5,
    high: latestPrice * 1.01,
    low: latestPrice * 0.99,
    open: latestPrice * 0.995,
    previousClose: latestPrice * 0.99,
    totalMarketCap: 1_500_000_000_000,
    circulatingMarketCap: 1_500_000_000_000,
  }
}

test('buildIndustryStrengthMap ranks stronger industries higher', () => {
  const stockPool: StockAnalysisWatchlistCandidate[] = [
    { code: '600519', name: '贵州茅台', market: 'sh', exchange: 'SSE', industryName: '酿酒行业' },
    { code: '000858', name: '五粮液', market: 'sz', exchange: 'SZSE', industryName: '酿酒行业' },
    { code: '600000', name: '浦发银行', market: 'sh', exchange: 'SSE', industryName: '银行' },
    { code: '601398', name: '工商银行', market: 'sh', exchange: 'SSE', industryName: '银行' },
  ]
  const quotes = new Map<string, StockAnalysisSpotQuote>([
    ['600519', createQuote(1500, '酿酒行业')],
    ['000858', { ...createQuote(130, '酿酒行业'), code: '000858', name: '五粮液', changePercent: 3.2 }],
    ['600000', { ...createQuote(10, '银行'), code: '600000', name: '浦发银行', changePercent: -0.4 }],
    ['601398', { ...createQuote(8, '银行'), code: '601398', name: '工商银行', changePercent: -0.2 }],
  ])

  const industryMap = buildIndustryStrengthMap(stockPool, quotes)
  assert.ok((industryMap.get('酿酒行业')?.rankPercentile ?? 0) > (industryMap.get('银行')?.rankPercentile ?? 0))
  assert.ok((industryMap.get('酿酒行业')?.breadth ?? 0) > (industryMap.get('银行')?.breadth ?? 0))
})

test('buildIndustryTrendMap ranks stronger medium-term industries higher', () => {
  const stockPool: StockAnalysisWatchlistCandidate[] = [
    { code: '600519', name: '贵州茅台', market: 'sh', exchange: 'SSE', industryName: '酿酒行业' },
    { code: '000858', name: '五粮液', market: 'sz', exchange: 'SZSE', industryName: '酿酒行业' },
    { code: '600000', name: '浦发银行', market: 'sh', exchange: 'SSE', industryName: '银行' },
    { code: '601398', name: '工商银行', market: 'sh', exchange: 'SSE', industryName: '银行' },
  ]
  const quotes = new Map<string, StockAnalysisSpotQuote>([
    ['600519', createQuote(1500, '酿酒行业')],
    ['000858', { ...createQuote(130, '酿酒行业'), code: '000858', name: '五粮液' }],
    ['600000', { ...createQuote(10, '银行'), code: '600000', name: '浦发银行' }],
    ['601398', { ...createQuote(8, '银行'), code: '601398', name: '工商银行' }],
  ])
  const historyMap = new Map<string, StockAnalysisKlinePoint[]>([
    ['600519', createHistory(Array.from({ length: 90 }, (_, index) => 100 + index * 1.1))],
    ['000858', createHistory(Array.from({ length: 90 }, (_, index) => 80 + index * 0.9))],
    ['600000', createHistory(Array.from({ length: 90 }, (_, index) => 60 - index * 0.2))],
    ['601398', createHistory(Array.from({ length: 90 }, (_, index) => 55 - index * 0.15))],
  ])

  const industryTrendMap = buildIndustryTrendMap(stockPool, quotes, historyMap)
  assert.ok((industryTrendMap.get('酿酒行业')?.rankPercentile ?? 0) > (industryTrendMap.get('银行')?.rankPercentile ?? 0))
  assert.ok((industryTrendMap.get('酿酒行业')?.averageReturn60d ?? 0) > (industryTrendMap.get('银行')?.averageReturn60d ?? 0))
})

function createMarketState(overrides?: Partial<StockAnalysisMarketState>): StockAnalysisMarketState {
  return {
    asOfDate: '2026-04-09',
    trend: 'bull_trend',
    volatility: 'normal_volatility',
    liquidity: 'normal_liquidity',
    sentiment: 'optimistic',
    style: 'balanced',
    csi500Return20d: 5.2,
    annualizedVolatility20d: 20,
    averageTurnover20d: 200_000_000_000,
    risingRatio: 0.62,
    volatilityPercentile: 0.45,
    volumePercentile: 0.55,
    ...overrides,
  }
}

test('technical indicators compute non-null values on sufficient history', () => {
  const closes = Array.from({ length: 140 }, (_, index) => 100 + index * 0.6)
  const history = createHistory(closes)

  assert.ok((calculateRsi(history) ?? 0) > 50)
  const macd = calculateMacd(history)
  assert.notEqual(macd.line, null)
  assert.notEqual(macd.signal, null)
  assert.notEqual(macd.histogram, null)
  assert.notEqual(calculateAtr(history), null)
})

test('buildSnapshot exposes upgraded technical fields', () => {
  const closes = Array.from({ length: 140 }, (_, index) => 100 + index * 0.8)
  const history = createHistory(closes)
  const candidate = createCandidate()
  const quote = createQuote(closes.at(-1) ?? 100)
  const industryMap = buildIndustryStrengthMap([candidate], new Map([[candidate.code, quote]]))
  const industryTrendMap = buildIndustryTrendMap([candidate], new Map([[candidate.code, quote]]), new Map([[candidate.code, history]]))
  const snapshot = buildSnapshot(candidate, quote, history, DEFAULT_STOCK_ANALYSIS_CONFIG as StockAnalysisStrategyConfig, industryMap, industryTrendMap)

  assert.equal(typeof snapshot.return120d, 'number')
  assert.equal(typeof snapshot.movingAverage120, 'number')
  assert.equal(typeof snapshot.movingAverage20Slope, 'number')
  assert.equal(typeof snapshot.movingAverage60Slope, 'number')
  assert.equal(typeof snapshot.rsi14, 'number')
  assert.equal(typeof snapshot.macdLine, 'number')
  assert.equal(typeof snapshot.macdSignal, 'number')
  assert.equal(typeof snapshot.macdHistogram, 'number')
  assert.equal(typeof snapshot.atr14, 'number')
  assert.equal(typeof snapshot.atrPercent, 'number')
  assert.equal(typeof snapshot.industryStrength, 'number')
  assert.equal(typeof snapshot.industryBreadth, 'number')
  assert.equal(typeof snapshot.industryReturn20d, 'number')
  assert.equal(typeof snapshot.industryReturn60d, 'number')
  assert.equal(typeof snapshot.industryTrendStrength, 'number')
})

test('uptrend snapshot scores higher than weak downtrend snapshot', () => {
  const strongCloses = Array.from({ length: 140 }, (_, index) => 100 + index * 0.8)
  const weakCloses = Array.from({ length: 140 }, (_, index) => 180 - index * 0.6)
  const strongCandidate = createCandidate()
  const weakCandidate = { ...createCandidate(), code: '000001', name: '平安银行', market: 'sz' as const, exchange: 'SZSE', industryName: '银行' }
  const strongQuote = createQuote(strongCloses.at(-1) ?? 100, '酿酒行业')
  const weakQuote = { ...createQuote(weakCloses.at(-1) ?? 100, '银行'), code: '000001', name: '平安银行', changePercent: -1.8 }
  const industryMap = buildIndustryStrengthMap(
    [strongCandidate, weakCandidate],
    new Map([
      [strongCandidate.code, strongQuote],
      [weakCandidate.code, weakQuote],
    ]),
  )
  const historyMap = new Map<string, StockAnalysisKlinePoint[]>([
    [strongCandidate.code, createHistory(strongCloses)],
    [weakCandidate.code, createHistory(weakCloses)],
  ])
  const industryTrendMap = buildIndustryTrendMap([strongCandidate, weakCandidate], new Map([
    [strongCandidate.code, strongQuote],
    [weakCandidate.code, weakQuote],
  ]), historyMap)
  const strongSnapshot = buildSnapshot(strongCandidate, strongQuote, historyMap.get(strongCandidate.code) ?? [], DEFAULT_STOCK_ANALYSIS_CONFIG as StockAnalysisStrategyConfig, industryMap, industryTrendMap)
  const weakSnapshot = buildSnapshot(weakCandidate, weakQuote, historyMap.get(weakCandidate.code) ?? [], DEFAULT_STOCK_ANALYSIS_CONFIG as StockAnalysisStrategyConfig, industryMap, industryTrendMap)

  const strongTechnical = buildTechnicalScore(strongSnapshot)
  const weakTechnical = buildTechnicalScore(weakSnapshot)
  assert.ok(strongTechnical.total > weakTechnical.total)
  assert.ok(strongTechnical.trend > weakTechnical.trend)

  const marketState = createMarketState()
  const strongQuant = buildQuantScore(strongSnapshot, marketState)
  const weakQuant = buildQuantScore(weakSnapshot, createMarketState({ trend: 'bear_trend', sentiment: 'pessimistic' }))
  assert.ok(strongQuant.total > weakQuant.total)
  assert.ok(strongQuant.mediumTermMomentum > weakQuant.mediumTermMomentum)
})

test('candidate pool score rewards stronger and more stable snapshots', () => {
  const strongCloses = Array.from({ length: 140 }, (_, index) => 60 + index * 0.5)
  const unstableCloses = Array.from({ length: 140 }, (_, index) => 120 + Math.sin(index) * 12 + index * 0.05)
  const strongCandidate = createCandidate()
  const unstableCandidate = { ...createCandidate(), code: '300001', name: '特锐德', market: 'sz' as const, exchange: 'SZSE', industryName: '电网设备' }
  const strongQuote = createQuote(strongCloses.at(-1) ?? 100, '酿酒行业')
  const unstableQuote = { ...createQuote(unstableCloses.at(-1) ?? 100, '电网设备'), code: '300001', name: '特锐德', changePercent: 0.2 }
  const industryMap = buildIndustryStrengthMap(
    [strongCandidate, unstableCandidate],
    new Map([
      [strongCandidate.code, strongQuote],
      [unstableCandidate.code, unstableQuote],
    ]),
  )
  const historyMap = new Map<string, StockAnalysisKlinePoint[]>([
    [strongCandidate.code, createHistory(strongCloses)],
    [unstableCandidate.code, createHistory(unstableCloses)],
  ])
  const industryTrendMap = buildIndustryTrendMap([strongCandidate, unstableCandidate], new Map([
    [strongCandidate.code, strongQuote],
    [unstableCandidate.code, unstableQuote],
  ]), historyMap)
  const strongSnapshot = buildSnapshot(strongCandidate, strongQuote, historyMap.get(strongCandidate.code) ?? [], DEFAULT_STOCK_ANALYSIS_CONFIG as StockAnalysisStrategyConfig, industryMap, industryTrendMap)
  const unstableSnapshot = buildSnapshot(unstableCandidate, unstableQuote, historyMap.get(unstableCandidate.code) ?? [], DEFAULT_STOCK_ANALYSIS_CONFIG as StockAnalysisStrategyConfig, industryMap, industryTrendMap)

  assert.ok(buildCandidatePoolScore(strongSnapshot) > buildCandidatePoolScore(unstableSnapshot))
})

test('industry trend prevents one-day hot but weak-medium-term industry from being overrated', () => {
  const strongCandidate = createCandidate()
  const hotWeakCandidate = { ...createCandidate(), code: '300001', name: '特锐德', market: 'sz' as const, exchange: 'SZSE', industryName: '电网设备' }
  const strongHistory = createHistory(Array.from({ length: 140 }, (_, index) => 70 + index * 0.55))
  const hotWeakHistory = createHistory(Array.from({ length: 140 }, (_, index) => 150 - index * 0.35))
  const strongQuote = { ...createQuote(strongHistory.at(-1)?.close ?? 100, '酿酒行业'), changePercent: 1.2 }
  const hotWeakQuote = { ...createQuote(hotWeakHistory.at(-1)?.close ?? 100, '电网设备'), code: '300001', name: '特锐德', changePercent: 4.8 }
  const stockPool = [strongCandidate, hotWeakCandidate]
  const quotes = new Map<string, StockAnalysisSpotQuote>([
    [strongCandidate.code, strongQuote],
    [hotWeakCandidate.code, hotWeakQuote],
  ])
  const historyMap = new Map<string, StockAnalysisKlinePoint[]>([
    [strongCandidate.code, strongHistory],
    [hotWeakCandidate.code, hotWeakHistory],
  ])
  const industryMap = buildIndustryStrengthMap(stockPool, quotes)
  const industryTrendMap = buildIndustryTrendMap(stockPool, quotes, historyMap)
  const strongSnapshot = buildSnapshot(strongCandidate, strongQuote, strongHistory, DEFAULT_STOCK_ANALYSIS_CONFIG as StockAnalysisStrategyConfig, industryMap, industryTrendMap)
  const hotWeakSnapshot = buildSnapshot(hotWeakCandidate, hotWeakQuote, hotWeakHistory, DEFAULT_STOCK_ANALYSIS_CONFIG as StockAnalysisStrategyConfig, industryMap, industryTrendMap)

  assert.ok((hotWeakSnapshot.industryStrength ?? 0) > (strongSnapshot.industryStrength ?? 0))
  assert.ok((strongSnapshot.industryTrendStrength ?? 0) > (hotWeakSnapshot.industryTrendStrength ?? 0))
  assert.ok(buildQuantScore(strongSnapshot, createMarketState()).total > buildQuantScore(hotWeakSnapshot, createMarketState()).total)
})

test('cross-sectional momentum ranks reward stronger 20d and 60d names', () => {
  const strongest = {
    ...createCandidate(),
    code: '600519',
    name: '贵州茅台',
    industryName: '酿酒行业',
  }
  const middle = {
    ...createCandidate(),
    code: '000858',
    name: '五粮液',
    market: 'sz' as const,
    exchange: 'SZSE',
    industryName: '酿酒行业',
  }
  const weakest = {
    ...createCandidate(),
    code: '600000',
    name: '浦发银行',
    industryName: '银行',
  }
  const strongestHistory = createHistory(Array.from({ length: 140 }, (_, index) => 60 + index * 0.8))
  const middleHistory = createHistory(Array.from({ length: 140 }, (_, index) => 80 + index * 0.35))
  const weakestHistory = createHistory(Array.from({ length: 140 }, (_, index) => 100 - index * 0.25))
  const stockPool = [strongest, middle, weakest]
  const quotes = new Map<string, StockAnalysisSpotQuote>([
    [strongest.code, createQuote(strongestHistory.at(-1)?.close ?? 100, '酿酒行业')],
    [middle.code, { ...createQuote(middleHistory.at(-1)?.close ?? 100, '酿酒行业'), code: middle.code, name: middle.name }],
    [weakest.code, { ...createQuote(weakestHistory.at(-1)?.close ?? 100, '银行'), code: weakest.code, name: weakest.name }],
  ])
  const historyMap = new Map<string, StockAnalysisKlinePoint[]>([
    [strongest.code, strongestHistory],
    [middle.code, middleHistory],
    [weakest.code, weakestHistory],
  ])
  const industryMap = buildIndustryStrengthMap(stockPool, quotes)
  const industryTrendMap = buildIndustryTrendMap(stockPool, quotes, historyMap)
  const baseSnapshots = [
    buildSnapshot(strongest, quotes.get(strongest.code)!, strongestHistory, DEFAULT_STOCK_ANALYSIS_CONFIG as StockAnalysisStrategyConfig, industryMap, industryTrendMap),
    buildSnapshot(middle, quotes.get(middle.code)!, middleHistory, DEFAULT_STOCK_ANALYSIS_CONFIG as StockAnalysisStrategyConfig, industryMap, industryTrendMap),
    buildSnapshot(weakest, quotes.get(weakest.code)!, weakestHistory, DEFAULT_STOCK_ANALYSIS_CONFIG as StockAnalysisStrategyConfig, industryMap, industryTrendMap),
  ]

  const rankedSnapshots = applyCrossSectionalMomentumRanks(baseSnapshots, buildCrossSectionalMomentumMap(baseSnapshots))
  const strongestSnapshot = rankedSnapshots.find((snapshot) => snapshot.code === strongest.code)
  const middleSnapshot = rankedSnapshots.find((snapshot) => snapshot.code === middle.code)
  const weakestSnapshot = rankedSnapshots.find((snapshot) => snapshot.code === weakest.code)

  assert.ok((strongestSnapshot?.momentumRank20d ?? 0) > (middleSnapshot?.momentumRank20d ?? 0))
  assert.ok((middleSnapshot?.momentumRank20d ?? 0) > (weakestSnapshot?.momentumRank20d ?? 0))
  assert.ok((strongestSnapshot?.momentumRank60d ?? 0) > (weakestSnapshot?.momentumRank60d ?? 0))
  assert.ok(buildQuantScore(strongestSnapshot!, createMarketState()).crossSectionalStrength > buildQuantScore(weakestSnapshot!, createMarketState()).crossSectionalStrength)
})

test('snapshots without cross-sectional ranks stay null until full-universe ranking is applied', () => {
  const candidate = createCandidate()
  const history = createHistory(Array.from({ length: 140 }, (_, index) => 50 + index * 0.4))
  const quote = createQuote(history.at(-1)?.close ?? 100)
  const industryMap = buildIndustryStrengthMap([candidate], new Map([[candidate.code, quote]]))
  const industryTrendMap = buildIndustryTrendMap([candidate], new Map([[candidate.code, quote]]), new Map([[candidate.code, history]]))
  const snapshot = buildSnapshot(candidate, quote, history, DEFAULT_STOCK_ANALYSIS_CONFIG as StockAnalysisStrategyConfig, industryMap, industryTrendMap)

  assert.equal(snapshot.momentumRank20d, null)
  assert.equal(snapshot.momentumRank60d, null)
})
