import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildBehaviorProfileSummary,
  buildConvictionStats,
  buildCumulativeReturnChartData,
  buildDailyAdviceSummary,
  buildDrawdownChartData,
  buildWeeklyDashboardSummary,
  buildWeeklyReturnChartData,
  buildWinRateChartData,
  formatModelGroupLabel,
} from './dashboardMeta'
import type { StockAnalysisOverview, StockAnalysisStrategyConfig } from './types'

const baseOverview: StockAnalysisOverview = {
  generatedAt: '2026-04-02T08:00:00.000Z',
  tradeDate: '2026-04-02',
  stockAnalysisDir: '/tmp/ai-stock',
  marketState: {
    asOfDate: '2026-04-02',
    trend: 'range_bound',
    volatility: 'normal_volatility',
    liquidity: 'normal_liquidity',
    sentiment: 'neutral',
    style: 'balanced',
    csi500Return20d: 1.2,
    annualizedVolatility20d: 18,
    averageTurnover20d: 120000000000,
    risingRatio: 0.52,
  },
  stats: {
    stockPoolSize: 500,
    candidatePoolSize: 3,
    passingSignals: 1,
    watchSignals: 1,
    openPositions: 1,
    tradeRecords: 2,
    cumulativeReturn: 8.5,
    weeklyReturn: 1.2,
    winRate: 0.45,
    maxDrawdown: -3.2,
  },
  topSignals: [
    {
      id: 'signal-1',
      tradeDate: '2026-04-02',
      code: '000456',
      name: '测试买入',
      latestPrice: 18.66,
      sector: '中证500',
      snapshot: {
        code: '000456',
        name: '测试买入',
        market: 'sz',
        exchange: '深交所',
        sector: '中证500',
        latestPrice: 18.66,
        changePercent: 2.3,
        turnoverRate: 3.2,
        totalMarketCap: 1000000000,
        circulatingMarketCap: 800000000,
        averageTurnoverAmount20d: 150000000,
        amplitude20d: 6,
        declineDays20d: 2,
        return5d: 3,
        return20d: 8,
        return60d: 10,
        volumeBreakout: 1.4,
        volatility20d: 22,
        volatilityRank: 0.3,
        pricePosition20d: 0.8,
        movingAverage5: 18,
        movingAverage20: 17,
        movingAverage60: 16,
        scoreReason: ['成交额达标'],
      },
      expert: { bullishCount: 32, bearishCount: 12, neutralCount: 6, consensus: 0.72, score: 80, highlights: ['专家分歧较小'], risks: ['暂无明显风险'] },
      marketState: {
        asOfDate: '2026-04-02', trend: 'range_bound', volatility: 'normal_volatility', liquidity: 'normal_liquidity', sentiment: 'neutral', style: 'balanced', csi500Return20d: 1.2, annualizedVolatility20d: 18, averageTurnover20d: 120000000000, risingRatio: 0.52,
      },
      thresholds: { minCompositeScore: 76, minExpertConsensus: 0.63, minTechnicalScore: 70, minQuantScore: 65 },
      technical: { total: 78, absolute: 75, relative: 77, sector: 81, notes: ['突破 20 日高点'] },
      quant: { total: 71, momentum: 74, volumeBreakout: 72, volatility: 68, liquidity: 70, value: 65, notes: ['动量因子强势'] },
      compositeScore: 79,
      finalScore: 82,
      action: 'buy',
      suggestedPosition: 0.25,
      suggestedPriceRange: { min: 18.5, max: 18.8 },
      stopLossPrice: 18.1,
      takeProfitPrice1: 19.2,
      takeProfitPrice2: 19.8,
      passingChecks: ['专家共识达标', '量能突破'],
      vetoReasons: [],
      watchReasons: [],
      reasoning: ['产业利好', '技术突破'],
      confidence: 0.82,
      createdAt: '2026-04-02T08:00:00.000Z',
      decisionSource: 'user_confirmed',
      userDecisionNote: '确认执行',
    },
    {
      id: 'signal-2',
      tradeDate: '2026-04-02',
      code: '300789',
      name: '测试观望',
      latestPrice: 24.2,
      sector: '成长科技',
      snapshot: {
        code: '300789', name: '测试观望', market: 'sz', exchange: '深交所', sector: '成长科技', latestPrice: 24.2, changePercent: 1.2, turnoverRate: 2.1, totalMarketCap: 2000000000, circulatingMarketCap: 1500000000, averageTurnoverAmount20d: 180000000, amplitude20d: 5.5, declineDays20d: 3, return5d: 2, return20d: 4, return60d: 6, volumeBreakout: 1.1, volatility20d: 25, volatilityRank: 0.5, pricePosition20d: 0.62, movingAverage5: 23.8, movingAverage20: 23.5, movingAverage60: 22.5, scoreReason: ['量能一般'] },
      expert: { bullishCount: 20, bearishCount: 18, neutralCount: 12, consensus: 0.53, score: 60, highlights: ['专家分歧较大'], risks: ['技术分一般'] },
      marketState: {
        asOfDate: '2026-04-02', trend: 'range_bound', volatility: 'normal_volatility', liquidity: 'normal_liquidity', sentiment: 'neutral', style: 'balanced', csi500Return20d: 1.2, annualizedVolatility20d: 18, averageTurnover20d: 120000000000, risingRatio: 0.52,
      },
      thresholds: { minCompositeScore: 76, minExpertConsensus: 0.63, minTechnicalScore: 70, minQuantScore: 65 },
      technical: { total: 67, absolute: 66, relative: 68, sector: 65, notes: ['技术分刚及格'] },
      quant: { total: 63, momentum: 62, volumeBreakout: 61, volatility: 64, liquidity: 66, value: 60, notes: ['量化分略低'] },
      compositeScore: 68,
      finalScore: 68,
      action: 'watch',
      suggestedPosition: 0,
      suggestedPriceRange: { min: 23.9, max: 24.4 },
      stopLossPrice: 23.4,
      takeProfitPrice1: 24.9,
      takeProfitPrice2: 25.6,
      passingChecks: [],
      vetoReasons: [],
      watchReasons: ['技术分刚及格，专家分歧大'],
      reasoning: ['证据不足，建议观望'],
      confidence: 0.68,
      createdAt: '2026-04-02T08:00:00.000Z',
      decisionSource: 'user_ignored',
      userDecisionNote: '暂不看',
    },
  ],
  positions: [{
    id: 'position-1',
    code: '600123',
    name: '测试持仓',
    openedAt: '2026-03-20T08:00:00.000Z',
    openDate: '2026-03-20',
    sourceSignalId: 'signal-0',
    quantity: 100,
    weight: 0.25,
    costPrice: 25.3,
    currentPrice: 24.49,
    returnPercent: -3.2,
    holdingDays: 13,
    stopLossPrice: 24.54,
    takeProfitPrice1: 26.05,
    takeProfitPrice2: 26.81,
    trailingStopEnabled: true,
    highestPriceSinceOpen: 25.8,
    action: 'stop_loss',
    actionReason: '触发止损 -3.2%',
  }],
  recentTrades: [
    { id: 'trade-1', action: 'buy', code: '600123', name: '测试持仓', tradeDate: '2026-03-20T08:00:00.000Z', price: 25.3, quantity: 100, weight: 0.25, sourceSignalId: 'signal-0', sourceDecision: 'user_confirmed', note: '开仓', relatedPositionId: 'position-1', pnlPercent: null },
    { id: 'trade-2', action: 'sell', code: '600999', name: '测试平仓', tradeDate: '2026-03-28T08:00:00.000Z', price: 26.8, quantity: 100, weight: 0.25, sourceSignalId: 'signal-x', sourceDecision: 'user_confirmed', note: '达到止盈', relatedPositionId: 'position-x', pnlPercent: 5.9 },
  ],
  watchLogs: [
    {
      id: 'watch-1',
      tradeDate: '2026-03-22',
      highestSignalScore: 72,
      reason: '有一只 72 分但未达 75 门槛',
      topCandidateCode: '300789',
      topCandidateName: '测试观望',
      tPlus1Return: -0.3,
      tPlus5Return: -2.1,
      outcome: 'correct',
      evaluatedAt: '2026-03-27T15:00:00.000Z',
      createdAt: '2026-03-22T08:00:00.000Z',
    },
  ],
  weeklySummary: [
    { weekLabel: '2026-W13', tradeCount: 3, watchDays: 2, winRate: 0.45, averageProfitLossRatio: 1.8, weeklyReturn: 1.2, cumulativeReturn: 8.5, maxDrawdown: -3.2 },
  ],
  monthlySummary: [
    { monthLabel: '2026-03', tradeCount: 6, watchDays: 7, winRate: 0.5, monthlyReturn: 3.2, cumulativeReturn: 3.2, maxDrawdown: -3.2 },
  ],
  modelGroupPerformance: [
    { group: 'claude', predictionCount: 118, winRate: 0.62, averageConfidence: 0.71, calibration: 0.85, weight: 1.2, isSimulated: true },
    { group: 'qwen', predictionCount: 42, winRate: 0.38, averageConfidence: 0.73, calibration: 0.75, weight: 1.0, isSimulated: true },
  ],
  performanceDashboard: {
    convictionPassRate: 0.15,
    watchAccuracy: 0.8,
    sharpeLike: 1.4,
    bestModelGroup: 'claude',
    worstModelGroup: 'qwen',
    overrideStats: {
      totalCount: 5,
      winCount: 5,
      winRate: 1,
      averageReturn: 2.18,
      systemWinRate: 0,
      systemAverageReturn: -4.33,
    },
    alerts: ['Qwen 组近期表现较弱'],
    tuningSuggestions: ['建议将 qwen 组权重从 1.00 下调至 0.80'],
  },
  systemStatus: {
    lastRunAt: '2026-04-02T08:00:00.000Z',
    lastSuccessAt: '2026-04-02T08:00:00.000Z',
    lastError: null,
    stockPoolRefreshedAt: '2026-04-02T07:55:00.000Z',
    latestSignalDate: '2026-04-02',
    runState: 'success',
    currentRun: null,
    dataState: 'ready',
    staleReasons: [],
    quoteCacheAt: '2026-04-02T08:00:00.000Z',
    indexHistoryCacheAt: '2026-04-02T08:00:00.000Z',
    isUsingFallback: false,
  },
}

const baseConfig: StockAnalysisStrategyConfig = {
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
}

test('buildDailyAdviceSummary returns buy sell watch sections and summary', () => {
  const summary = buildDailyAdviceSummary(baseOverview)
  assert.equal(summary.sells.length, 1)
  assert.equal(summary.buys.length, 1)
  assert.equal(summary.watches.length, 1)
  assert.equal(summary.swaps.length, 0)
  assert.match(summary.stats.summaryText, /卖出 1 笔/)
})

test('buildWeeklyDashboardSummary derives alerts and tuning suggestions', () => {
  const summary = buildWeeklyDashboardSummary(baseOverview, baseConfig)
  assert.equal(summary.bestGroup, 'Claude 组')
  assert.equal(summary.worstGroup, 'Qwen 组')
  assert.match(summary.alerts.join(' | '), /Qwen 组近期表现较弱/)
  assert.match(summary.tuningSuggestions.join(' | '), /qwen 组权重/)
  // override stats
  assert.equal(summary.overrideCount, 5)
  assert.equal(summary.overrideWinRate, 1)
  assert.equal(summary.overrideAvgReturn, 2.18)
})

test('buildBehaviorProfileSummary tracks execution and override ratios', () => {
  const profile = buildBehaviorProfileSummary(baseOverview)
  assert.equal(Math.round(profile.executionRate * 100), 50)
  assert.equal(Math.round(profile.ignoreRate * 100), 50)
  assert.equal(Math.round(profile.rejectRate * 100), 0)
  assert.equal(Math.round(profile.overrideRate * 100), 0)
  assert.ok(profile.disciplineScore > 0)

  // 验证包含 override 信号时 overrideRate 正确
  const overrideSignal = {
    ...baseOverview.topSignals[1],
    id: 'signal-3',
    decisionSource: 'user_override' as const,
    userDecisionNote: '用户推翻观望',
  }
  const overviewWithOverride = {
    ...baseOverview,
    topSignals: [...baseOverview.topSignals, overrideSignal],
  }
  const profile2 = buildBehaviorProfileSummary(overviewWithOverride)
  assert.equal(Math.round(profile2.overrideRate * 100), 33) // 1/3
})

test('buildConvictionStats exposes current threshold summary', () => {
  const stats = buildConvictionStats(baseOverview.topSignals, baseOverview.marketState)
  assert.equal(stats.buyCount, 1)
  assert.equal(stats.watchCount, 1)
  assert.match(stats.thresholdSummary, /综合 76/)
})

test('formatModelGroupLabel formats built-in model groups', () => {
  assert.equal(formatModelGroupLabel('rules'), '规则函数组')
  assert.equal(formatModelGroupLabel('gpt'), 'GPT 组')
})

test('buildDailyAdviceSummary includes proactive sell signals from positionEvaluations', () => {
  const overviewWithEvals = {
    ...baseOverview,
    positionEvaluations: [{
      positionId: 'position-2',
      code: '000858',
      name: '五粮液',
      currentExpertScore: 40,
      currentTechnicalScore: 35,
      currentQuantScore: 30,
      currentCompositeScore: 35,
      buyCompositeScore: 75,
      scoreDelta: -40,
      expertConsensus: 0.35,
      technicalBreakdown: true,
      sellRecommended: true,
      sellReason: 'score_drop' as const,
      sellReasonText: '综合评分下降 40 分（阈值 15），建议卖出',
      reasoning: ['评分大幅下降：75 -> 35'],
    }],
  }

  const summary = buildDailyAdviceSummary(overviewWithEvals)
  // 1 reactive sell (stop_loss from position) + 1 proactive sell (from evaluation)
  assert.equal(summary.sells.length, 2)
  assert.ok(summary.sells.some((item) => item.title.includes('五粮液')))
  assert.ok(summary.sells.some((item) => item.title.includes('主动卖出')))
})

test('buildDailyAdviceSummary includes swap suggestions', () => {
  const overviewWithSwaps = {
    ...baseOverview,
    positionEvaluations: [],
    swapSuggestions: [{
      sellPositionId: 'pos-1',
      sellCode: '600123',
      sellName: '测试持仓',
      sellCurrentScore: 55,
      buySignalId: 'signal-new',
      buyCode: '000001',
      buyName: '平安银行',
      buyFinalScore: 80,
      scoreDifference: 25,
      reasoning: '新标的高出 25 分',
    }],
  }

  const summary = buildDailyAdviceSummary(overviewWithSwaps)
  assert.equal(summary.swaps.length, 1)
  assert.ok(summary.swaps[0].title.includes('平安银行'))
  assert.ok(summary.swaps[0].summary.includes('+25'))
  assert.match(summary.stats.summaryText, /换仓 1 笔/)
})

test('buildDailyAdviceSummary avoids duplicate sells for same code in reactive and proactive', () => {
  const overviewWithDups = {
    ...baseOverview,
    positionEvaluations: [{
      positionId: 'position-1',
      code: '600123',
      name: '测试持仓',
      currentExpertScore: 40,
      currentTechnicalScore: 35,
      currentQuantScore: 30,
      currentCompositeScore: 35,
      buyCompositeScore: 75,
      scoreDelta: -40,
      expertConsensus: 0.35,
      technicalBreakdown: true,
      sellRecommended: true,
      sellReason: 'score_drop' as const,
      sellReasonText: '综合评分下降 40 分',
      reasoning: [],
    }],
  }

  const summary = buildDailyAdviceSummary(overviewWithDups)
  // position-1 (code: 600123) already has reactive stop_loss sell, so proactive should be filtered out
  assert.equal(summary.sells.length, 1)
  assert.equal(summary.sells[0].code, '600123')
})

// ---------- 绩效图表数据 ----------

const multiWeekOverview = {
  ...baseOverview,
  weeklySummary: [
    { weekLabel: '2026-W13', tradeCount: 3, watchDays: 2, winRate: 0.45, averageProfitLossRatio: 1.8, weeklyReturn: 1.2, cumulativeReturn: 8.5, maxDrawdown: -3.2 },
    { weekLabel: '2026-W12', tradeCount: 2, watchDays: 3, winRate: 0.60, averageProfitLossRatio: 2.1, weeklyReturn: 3.5, cumulativeReturn: 7.3, maxDrawdown: -2.5 },
    { weekLabel: '2026-W11', tradeCount: 1, watchDays: 4, winRate: 0.50, averageProfitLossRatio: 1.5, weeklyReturn: -1.2, cumulativeReturn: 3.8, maxDrawdown: -1.8 },
  ],
}

test('buildCumulativeReturnChartData returns time-ascending data', () => {
  const data = buildCumulativeReturnChartData(multiWeekOverview)
  assert.equal(data.length, 3)
  // reversed from weeklySummary (newest-first) to time-ascending
  assert.equal(data[0].label, '2026-W11')
  assert.equal(data[2].label, '2026-W13')
  assert.equal(data[0].value, 3.8)
  assert.equal(data[2].value, 8.5)
})

test('buildDrawdownChartData returns negative drawdown values time-ascending', () => {
  const data = buildDrawdownChartData(multiWeekOverview)
  assert.equal(data.length, 3)
  assert.equal(data[0].label, '2026-W11')
  assert.equal(data[0].value, -1.8)
  assert.equal(data[2].value, -3.2)
})

test('buildWinRateChartData returns percentage values time-ascending', () => {
  const data = buildWinRateChartData(multiWeekOverview)
  assert.equal(data.length, 3)
  assert.equal(data[0].label, '2026-W11')
  assert.equal(data[0].value, 50)
  assert.equal(data[1].value, 60)
  assert.equal(data[2].value, 45)
})

test('buildWeeklyReturnChartData returns weekly returns time-ascending', () => {
  const data = buildWeeklyReturnChartData(multiWeekOverview)
  assert.equal(data.length, 3)
  assert.equal(data[0].label, '2026-W11')
  assert.equal(data[0].value, -1.2)
  assert.equal(data[1].value, 3.5)
  assert.equal(data[2].value, 1.2)
})

test('chart data helpers return empty array when no weekly summaries', () => {
  const emptyWeekOverview = { ...baseOverview, weeklySummary: [] }
  assert.equal(buildCumulativeReturnChartData(emptyWeekOverview).length, 0)
  assert.equal(buildDrawdownChartData(emptyWeekOverview).length, 0)
  assert.equal(buildWinRateChartData(emptyWeekOverview).length, 0)
  assert.equal(buildWeeklyReturnChartData(emptyWeekOverview).length, 0)
})

test('chart data helpers return single point when only one week', () => {
  // single week = baseOverview (has 1 weeklySummary)
  const data = buildCumulativeReturnChartData(baseOverview)
  assert.equal(data.length, 1)
  assert.equal(data[0].value, 8.5)
})
