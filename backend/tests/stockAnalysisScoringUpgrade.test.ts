import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  StockAnalysisKlinePoint,
  StockAnalysisSpotQuote,
  StockAnalysisWatchlistCandidate,
  StockAnalysisStrategyConfig,
  StockAnalysisMarketState,
} from '../src/services/stock-analysis/types'
import { _testing } from '../src/services/stock-analysis/service'
import { DEFAULT_STOCK_ANALYSIS_CONFIG } from '../src/services/stock-analysis/store'

const {
  buildIndustryStrengthMap,
  buildIndustryTrendMap,
  buildCrossSectionalMomentumMap,
  applyCrossSectionalMomentumRanks,
  buildSnapshot,
  buildTechnicalScore,
  buildQuantScore,
  buildCandidatePoolScore,
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
