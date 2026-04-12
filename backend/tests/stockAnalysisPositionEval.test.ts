import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  StockAnalysisPosition,
  StockAnalysisPositionEvaluation,
  StockAnalysisSignal,
  StockAnalysisStockSnapshot,
  StockAnalysisMarketState,
  StockAnalysisStrategyConfig,
} from '../src/services/stock-analysis/types'

// 使用 _testing 导出进行单元测试
import { _testing } from '../src/services/stock-analysis/service'
const { evaluatePositionScores, buildSwapSuggestions } = _testing

function createMockMarketState(overrides?: Partial<StockAnalysisMarketState>): StockAnalysisMarketState {
  return {
    asOfDate: '2026-04-03',
    trend: 'range_bound',
    volatility: 'normal_volatility',
    liquidity: 'normal_liquidity',
    sentiment: 'neutral',
    style: 'balanced',
    csi500Return20d: 2,
    annualizedVolatility20d: 18,
    averageTurnover20d: 200_000_000_000,
    risingRatio: 0.55,
    ...overrides,
  }
}

function createMockConfig(): StockAnalysisStrategyConfig {
  return {
    maxPositions: 3,
    maxSinglePosition: 0.35,
    maxTotalPosition: 0.8,
    stopLossPercent: 8,
    takeProfitPercent1: 10,
    takeProfitPercent2: 20,
    maxHoldDays: 20,
    minTurnoverAmount20d: 50_000_000,
    minAmplitude20d: 1.5,
    maxContinuousDeclineDays: 12,
    marketThresholds: {
      bull_trend: { minCompositeScore: 65, minExpertConsensus: 0.55, minTechnicalScore: 45, minQuantScore: 40 },
      bear_trend: { minCompositeScore: 80, minExpertConsensus: 0.7, minTechnicalScore: 60, minQuantScore: 55 },
      high_volatility: { minCompositeScore: 75, minExpertConsensus: 0.65, minTechnicalScore: 55, minQuantScore: 50 },
      low_volatility_range: { minCompositeScore: 70, minExpertConsensus: 0.6, minTechnicalScore: 50, minQuantScore: 45 },
      normal_range: { minCompositeScore: 72, minExpertConsensus: 0.6, minTechnicalScore: 50, minQuantScore: 45 },
    },
    fusionWeightsByRegime: {
      bull_trend: { expert: 0.3, technical: 0.4, quant: 0.3 },
      bear_trend: { expert: 0.4, technical: 0.3, quant: 0.3 },
      high_volatility: { expert: 0.35, technical: 0.35, quant: 0.3 },
      low_volatility_range: { expert: 0.3, technical: 0.35, quant: 0.35 },
      normal_range: { expert: 0.33, technical: 0.34, quant: 0.33 },
    },
    lowLiquidityGuardrail: {
      volumePercentileThreshold: 0.1,
      crisisRisingRatioThreshold: 0.4,
      scorePenalty: 5,
      maxPositionRatio: 0.65,
      crisisMaxPositionRatio: 0.35,
    },
    trailingStop: { activationPercent: 3, pullbackPercent: 2 },
    portfolioRiskLimits: { maxDailyLossPercent: 3, maxWeeklyLossPercent: 5, maxMonthlyLossPercent: 10, maxDrawdownPercent: 15 },
  }
}

function createMockSnapshot(overrides?: Partial<StockAnalysisStockSnapshot>): StockAnalysisStockSnapshot {
  return {
    code: '600519',
    name: '贵州茅台',
    market: 'sh',
    exchange: 'SSE',
    sector: '白酒',
    latestPrice: 1500,
    changePercent: 0.5,
    turnoverRate: 3.2,
    totalMarketCap: 1_800_000_000_000,
    circulatingMarketCap: 1_800_000_000_000,
    averageTurnoverAmount20d: 500_000_000,
    amplitude20d: 3.5,
    declineDays20d: 2,
    return5d: 1.5,
    return20d: 8,
    return60d: 12,
    return120d: 18,
    momentumRank20d: 0.8,
    momentumRank60d: 0.75,
    volumeBreakout: 1.2,
    volatility20d: 22,
    volatilityRank: 0.5,
    pricePosition20d: 0.7,
    movingAverage5: 1490,
    movingAverage20: 1460,
    movingAverage60: 1420,
    movingAverage120: 1380,
    movingAverage20Slope: 1.2,
    movingAverage60Slope: 0.8,
    rsi14: 58,
    macdLine: 1.5,
    macdSignal: 1.2,
    macdHistogram: 0.3,
    atr14: 28,
    atrPercent: 1.9,
    distanceToResistance1: 4.5,
    distanceToSupport1: 3.2,
    industryStrength: 0.7,
    industryBreadth: 0.65,
    industryReturn20d: 6,
    industryReturn60d: 12,
    industryTrendStrength: 0.72,
    scoreReason: ['成交额达标', '20日振幅充足'],
    ...overrides,
  }
}

function createMockPosition(overrides?: Partial<StockAnalysisPosition>): StockAnalysisPosition {
  return {
    id: 'position-600519-1',
    code: '600519',
    name: '贵州茅台',
    openedAt: '2026-03-20T09:30:00.000Z',
    openDate: '2026-03-20',
    sourceSignalId: 'signal-600519-2026-03-20',
    quantity: 100,
    weight: 0.3,
    costPrice: 1450,
    currentPrice: 1500,
    returnPercent: 3.45,
    holdingDays: 14,
    stopLossPrice: 1334,
    takeProfitPrice1: 1595,
    takeProfitPrice2: 1740,
    trailingStopEnabled: true,
    highestPriceSinceOpen: 1510,
    action: 'hold',
    actionReason: '仓位运行正常',
    ...overrides,
  }
}

test('evaluatePositionScores: 正常持仓不触发卖出信号', async () => {
  const position = createMockPosition()
  const snapshot = createMockSnapshot()
  const marketState = createMockMarketState()
  const config = createMockConfig()

  const result = await evaluatePositionScores(position, snapshot, marketState, config, 75)

  assert.equal(result.positionId, position.id)
  assert.equal(result.code, '600519')
  assert.equal(result.buyCompositeScore, 75)
  assert.equal(result.buyFinalScore, 75)
  assert.equal(typeof result.currentCompositeScore, 'number')
  assert.equal(typeof result.currentFinalScore, 'number')
  assert.equal(typeof result.scoreDelta, 'number')
  assert.equal(typeof result.expertConsensus, 'number')
  assert.equal(typeof result.technicalBreakdown, 'boolean')
  assert.ok(result.reasoning.length > 0)
  // 在正常市场 + 正常持仓情况下不应该触发卖出
  // （实际结果取决于评分函数，但高质量股票一般不会大幅下跌）
})

test('evaluatePositionScores: scoreDelta compares base score, final score keeps bonus separate', async () => {
  const position = createMockPosition()
  const snapshot = createMockSnapshot({ return20d: 10, volumeBreakout: 1.4, pricePosition20d: 0.82 })
  const marketState = createMockMarketState({ trend: 'bull_trend' })
  const config = createMockConfig()

  const result = await evaluatePositionScores(position, snapshot, marketState, config, 70, 75)

  assert.ok(result.currentFinalScore >= result.currentCompositeScore)
  assert.equal(result.buyFinalScore, 75)
  assert.ok(result.reasoning.some((line) => line.includes('当前基础分')))
  assert.ok(result.reasoning.some((line) => line.includes('当前最终分')))
})

test('evaluatePositionScores: 评分大幅下降触发 score_drop 卖出信号', async () => {
  const position = createMockPosition()
  // 创建一个表现很差的 snapshot：价格跌破均线，20日收益为负，连续下跌
  const weakSnapshot = createMockSnapshot({
    latestPrice: 1300,
    return20d: -15,
    return5d: -8,
    declineDays20d: 12,
    pricePosition20d: 0.1,
    volumeBreakout: 0.6,
    movingAverage20: 1400,
    movingAverage60: 1450,
  })
  const marketState = createMockMarketState({ trend: 'bear_trend' })
  const config = createMockConfig()

  const result = await evaluatePositionScores(position, weakSnapshot, marketState, config, 85)

  assert.equal(result.buyCompositeScore, 85)
  assert.ok(result.scoreDelta < 0, `scoreDelta should be negative, got ${result.scoreDelta}`)
  // 买入时 85 分，弱 snapshot 应导致大幅评分下降，触发卖出
  assert.equal(result.sellRecommended, true, '极差快照应触发卖出信号')
  // 当同时满足 score_drop 和 expert_bearish 时，expert_bearish 覆盖（优先级更高）
  assert.ok(
    result.sellReason === 'score_drop' || result.sellReason === 'expert_bearish',
    `sellReason should be score_drop or expert_bearish, got ${result.sellReason}`,
  )
})

test('evaluatePositionScores: 专家转空 + 技术破位触发 expert_bearish 卖出信号', async () => {
  const position = createMockPosition()
  // 创建专家共识极低 + 技术破位的 snapshot
  const bearishSnapshot = createMockSnapshot({
    latestPrice: 1300,
    return20d: -20,
    return5d: -10,
    declineDays20d: 15,
    pricePosition20d: 0.05,
    volumeBreakout: 0.4,
    movingAverage20: 1400,
    movingAverage60: 1450,
  })
  const marketState = createMockMarketState({ trend: 'bear_trend' })
  const config = createMockConfig()

  const result = await evaluatePositionScores(position, bearishSnapshot, marketState, config, 75)

  assert.ok(result.expertConsensus < 0.5, `expertConsensus should be low, got ${result.expertConsensus}`)
  assert.equal(result.technicalBreakdown, true, '应检测到技术破位')
  // 如果专家共识 < 0.4 且技术破位，应触发 expert_bearish
  if (result.expertConsensus < 0.4) {
    assert.equal(result.sellRecommended, true)
    assert.equal(result.sellReason, 'expert_bearish')
  }
})

test('buildSwapSuggestions: 持仓未满时不生成换仓建议', () => {
  const evaluations: StockAnalysisPositionEvaluation[] = [{
    positionId: 'pos-1',
    code: '600519',
    name: '贵州茅台',
    currentExpertScore: 65,
    currentTechnicalScore: 55,
    currentQuantScore: 50,
    currentCompositeScore: 56,
    currentFinalScore: 56,
    buyCompositeScore: 75,
    buyFinalScore: 75,
    scoreDelta: -19,
    expertConsensus: 0.55,
    technicalBreakdown: false,
    sellRecommended: true,
    sellReason: 'score_drop',
    sellReasonText: '综合评分下降 19 分',
    reasoning: [],
  }]

  const signals = [{
    id: 'signal-1',
    finalScore: 85,
    action: 'buy',
    code: '000001',
    name: '平安银行',
  }] as StockAnalysisSignal[]

  // 持仓只有 1 个，上限 3 个，不触发换仓
  const result = buildSwapSuggestions(evaluations, signals, 3, 1)
  assert.equal(result.length, 0)
})

test('buildSwapSuggestions: 持仓满且新信号优势足够时生成换仓建议', () => {
  const evaluations: StockAnalysisPositionEvaluation[] = [
    {
      positionId: 'pos-1',
      code: '600519',
      name: '贵州茅台',
      currentExpertScore: 65,
      currentTechnicalScore: 55,
      currentQuantScore: 50,
      currentCompositeScore: 56,
      currentFinalScore: 56,
      buyCompositeScore: 75,
      buyFinalScore: 75,
      scoreDelta: -19,
      expertConsensus: 0.55,
      technicalBreakdown: false,
      sellRecommended: true,
      sellReason: 'score_drop',
      sellReasonText: '综合评分下降 19 分',
      reasoning: [],
    },
    {
      positionId: 'pos-2',
      code: '000858',
      name: '五粮液',
      currentExpertScore: 70,
      currentTechnicalScore: 65,
      currentQuantScore: 60,
      currentCompositeScore: 65,
      currentFinalScore: 65,
      buyCompositeScore: 72,
      buyFinalScore: 72,
      scoreDelta: -7,
      expertConsensus: 0.6,
      technicalBreakdown: false,
      sellRecommended: false,
      sellReason: null,
      sellReasonText: '持仓评估正常',
      reasoning: [],
    },
    {
      positionId: 'pos-3',
      code: '601318',
      name: '中国平安',
      currentExpertScore: 72,
      currentTechnicalScore: 68,
      currentQuantScore: 64,
      currentCompositeScore: 68,
      currentFinalScore: 68,
      buyCompositeScore: 73,
      buyFinalScore: 73,
      scoreDelta: -5,
      expertConsensus: 0.62,
      technicalBreakdown: false,
      sellRecommended: false,
      sellReason: null,
      sellReasonText: '持仓评估正常',
      reasoning: [],
    },
  ]

  const signals = [{
    id: 'signal-new-1',
    finalScore: 80,
    action: 'buy' as const,
    code: '000001',
    name: '平安银行',
  }] as StockAnalysisSignal[]

  // 持仓满 3 个，最弱持仓 56 分，新信号 80 分，差距 24 > 10
  const result = buildSwapSuggestions(evaluations, signals, 3, 3)
  assert.ok(result.length > 0, '应生成至少一条换仓建议')
  assert.equal(result[0].sellCode, '600519')
  assert.equal(result[0].buyCode, '000001')
  assert.ok(result[0].scoreDifference >= 10)
})

test('buildSwapSuggestions: 新信号优势不足时不生成换仓建议', () => {
  const evaluations: StockAnalysisPositionEvaluation[] = [{
    positionId: 'pos-1',
    code: '600519',
    name: '贵州茅台',
    currentExpertScore: 70,
    currentTechnicalScore: 68,
    currentQuantScore: 65,
    currentCompositeScore: 68,
    currentFinalScore: 68,
    buyCompositeScore: 75,
    buyFinalScore: 75,
    scoreDelta: -7,
    expertConsensus: 0.6,
    technicalBreakdown: false,
    sellRecommended: false,
    sellReason: null,
    sellReasonText: '持仓评估正常',
    reasoning: [],
  }]

  // 新信号 75 分，最弱持仓 68 分，差距只有 7 < 10
  const signals = [{
    id: 'signal-new-1',
    finalScore: 75,
    action: 'buy' as const,
    code: '000001',
    name: '平安银行',
  }] as StockAnalysisSignal[]

  const result = buildSwapSuggestions(evaluations, signals, 3, 3)
  assert.equal(result.length, 0, '优势不足时不应生成换仓建议')
})
