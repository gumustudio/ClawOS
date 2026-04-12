import type {
  MarketRegime,
  StockAnalysisMarketState,
  StockAnalysisOverview,
  StockAnalysisSignal,
  StockAnalysisStrategyConfig,
  StockAnalysisTradeRecord,
} from './types'

function deriveMarketRegime(marketState: StockAnalysisMarketState): MarketRegime {
  if (marketState.trend === 'bull_trend') return 'bull_trend'
  if (marketState.trend === 'bear_trend') return 'bear_trend'
  if (marketState.volatility === 'high_volatility') return 'high_volatility'
  if (marketState.volatility === 'low_volatility') return 'low_volatility_range'
  return 'normal_range'
}

export interface DailyAdviceItem {
  type: 'buy' | 'sell' | 'watch' | 'swap'
  title: string
  code: string | null
  score?: number
  summary: string
  bullets: string[]
}

export interface DailyAdviceSummary {
  positionUsageLabel: string
  sells: DailyAdviceItem[]
  buys: DailyAdviceItem[]
  watches: DailyAdviceItem[]
  swaps: DailyAdviceItem[]
  stats: {
    analyzed: number
    passed: number
    watched: number
    summaryText: string
  }
}

export interface WeeklyDashboardSummary {
  winRate: number
  profitLossRatio: number
  weeklyReturn: number
  cumulativeReturn: number
  maxDrawdown: number
  sharpeLike: number
  watchAccuracy: number
  tradeCount: number
  watchDays: number
  bestGroup: string | null
  worstGroup: string | null
  overrideWinRate: number | null
  overrideAvgReturn: number | null
  overrideCount: number
  alerts: string[]
  tuningSuggestions: string[]
}

export interface BehaviorProfileSummary {
  executionRate: number
  ignoreRate: number
  rejectRate: number
  overrideRate: number
  watchRate: number
  disciplineScore: number
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function safeDivide(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator
}

export function formatModelGroupLabel(group: string) {
  switch (group) {
    case 'gpt': return 'GPT 组'
    case 'claude': return 'Claude 组'
    case 'gemini': return 'Gemini 组'
    case 'qwen': return 'Qwen 组'
    case 'rules': return '规则函数组'
    case 'rule-engine': return '规则函数组'
    case 'rule-fallback': return '降级推断'
    default: return group
  }
}

export function buildDailyAdviceSummary(overview: StockAnalysisOverview): DailyAdviceSummary {
  const passingSignals = overview.topSignals.filter((signal) => signal.action === 'strong_buy' || signal.action === 'buy')
  const watchSignals = overview.topSignals.filter((signal) => signal.action === 'watch')

  // 反应式卖出信号（止损/止盈/减仓/到期）
  const reactiveSells = overview.positions
    .filter((position) => position.action === 'stop_loss' || position.action === 'take_profit' || position.action === 'reduce' || position.action === 'review')
    .map<DailyAdviceItem>((position) => ({
      type: 'sell',
      title: position.name,
      code: position.code,
      summary: position.actionReason,
      bullets: [
        `当前收益 ${position.returnPercent.toFixed(2)}%`,
        `止损位 ${position.stopLossPrice.toFixed(2)}`,
        `止盈位 ${position.takeProfitPrice1.toFixed(2)} / ${position.takeProfitPrice2.toFixed(2)}`,
      ],
    }))

  // 主动卖出信号（持仓评估发现评分下降或转空）
  const proactiveSells = (overview.positionEvaluations ?? [])
    .filter((evaluation) => evaluation.sellRecommended)
    .filter((evaluation) => !reactiveSells.some((item) => item.code === evaluation.code))
    .map<DailyAdviceItem>((evaluation) => ({
      type: 'sell',
      title: `${evaluation.name}（主动卖出）`,
      code: evaluation.code,
      summary: evaluation.sellReasonText,
      bullets: [
        `买入基础分 ${evaluation.buyCompositeScore}，当前基础分 ${evaluation.currentCompositeScore}（${evaluation.scoreDelta > 0 ? '+' : ''}${evaluation.scoreDelta}）`,
        `专家共识 ${evaluation.expertConsensus.toFixed(2)}${evaluation.technicalBreakdown ? '，技术面已破位' : ''}`,
        ...evaluation.reasoning.slice(0, 1),
      ],
    }))

  const sellSignals = [...reactiveSells, ...proactiveSells]

  // 换仓建议
  const swapItems = (overview.swapSuggestions ?? []).map<DailyAdviceItem>((swap) => ({
    type: 'swap',
    title: `${swap.sellName} → ${swap.buyName}`,
    code: swap.buyCode,
    score: swap.buyFinalScore,
    summary: `换仓优势 +${swap.scoreDifference} 分`,
    bullets: [
      `卖出 ${swap.sellName}（当前 ${swap.sellCurrentScore} 分）`,
      `买入 ${swap.buyName}（${swap.buyFinalScore} 分）`,
      swap.reasoning,
    ],
  }))

  const buyItems = passingSignals.slice(0, 3).map<DailyAdviceItem>((signal) => ({
    type: 'buy',
    title: signal.name,
    code: signal.code,
    score: signal.finalScore,
    summary: `建议仓位 ${Math.round(signal.suggestedPosition * 100)}%，建议价 ${signal.suggestedPriceRange.min.toFixed(2)}-${signal.suggestedPriceRange.max.toFixed(2)}`,
    bullets: [
      `专家共识 ${signal.expert.consensus.toFixed(2)}（看多 ${signal.expert.bullishCount} / 看空 ${signal.expert.bearishCount}）`,
      `技术分 ${signal.technical.total}，量化分 ${signal.quant.total}`,
      ...signal.passingChecks.slice(0, 2),
    ],
  }))

  const watchItems = watchSignals.slice(0, 3).map<DailyAdviceItem>((signal) => ({
    type: 'watch',
    title: signal.name,
    code: signal.code,
    score: signal.finalScore,
    summary: signal.watchReasons[0] ?? '未达到 Conviction Filter 买入门槛',
    bullets: signal.watchReasons.length > 0 ? signal.watchReasons.slice(0, 3) : ['证据不足，建议继续观望'],
  }))

  const summaryParts = [
    sellSignals.length > 0 ? `卖出 ${sellSignals.length} 笔` : null,
    swapItems.length > 0 ? `换仓 ${swapItems.length} 笔` : null,
    buyItems.length > 0 ? `买入 ${buyItems.length} 笔` : null,
    `观望 ${Math.max(watchSignals.length, overview.stats.candidatePoolSize - passingSignals.length)} 只`,
  ].filter(Boolean)

  return {
    positionUsageLabel: `${overview.positions.length}/${overview.stats.maxPositions ?? 3} 只`,
    sells: sellSignals,
    buys: buyItems,
    watches: watchItems,
    swaps: swapItems,
    stats: {
      analyzed: overview.stats.candidatePoolSize,
      passed: passingSignals.length,
      watched: Math.max(watchSignals.length, overview.stats.candidatePoolSize - passingSignals.length),
      summaryText: summaryParts.join(' + '),
    },
  }
}

function calculateProfitLossRatio(trades: StockAnalysisTradeRecord[]) {
  const sellTrades = trades.filter((trade) => trade.action === 'sell' && typeof trade.pnlPercent === 'number')
  const profitValues = sellTrades.map((trade) => trade.pnlPercent ?? 0).filter((value) => value > 0)
  const lossValues = sellTrades.map((trade) => trade.pnlPercent ?? 0).filter((value) => value < 0).map(Math.abs)
  return safeDivide(average(profitValues), average(lossValues))
}

function calculateSharpeLike(trades: StockAnalysisTradeRecord[]) {
  const returns = trades
    .filter((trade) => trade.action === 'sell' && typeof trade.pnlPercent === 'number')
    .map((trade) => trade.pnlPercent ?? 0)
  const avg = average(returns)
  const variance = average(returns.map((value) => (value - avg) ** 2))
  return variance === 0 ? 0 : avg / Math.sqrt(variance)
}

function calculateWatchAccuracy(overview: StockAnalysisOverview) {
  const watchLogs = overview.watchLogs
  if (watchLogs.length === 0) {
    return 0
  }
  const correctCount = watchLogs.filter((item) => item.highestSignalScore < 75).length
  return safeDivide(correctCount, watchLogs.length)
}

export function buildWeeklyDashboardSummary(overview: StockAnalysisOverview, config: StockAnalysisStrategyConfig | null): WeeklyDashboardSummary {
  if (overview.performanceDashboard) {
    const bestGroup = overview.performanceDashboard.bestModelGroup
    const worstGroup = overview.performanceDashboard.worstModelGroup
    const latestWeek = overview.weeklySummary[0]
    return {
      winRate: latestWeek?.winRate ?? overview.stats.winRate,
      profitLossRatio: latestWeek?.averageProfitLossRatio ?? calculateProfitLossRatio(overview.recentTrades),
      weeklyReturn: latestWeek?.weeklyReturn ?? overview.stats.weeklyReturn,
      cumulativeReturn: overview.stats.cumulativeReturn,
      maxDrawdown: overview.stats.maxDrawdown,
      sharpeLike: overview.performanceDashboard.sharpeLike,
      watchAccuracy: overview.performanceDashboard.watchAccuracy,
      tradeCount: latestWeek?.tradeCount ?? overview.recentTrades.length,
      watchDays: latestWeek?.watchDays ?? overview.watchLogs.length,
      bestGroup: bestGroup ? formatModelGroupLabel(bestGroup) : null,
      worstGroup: worstGroup ? formatModelGroupLabel(worstGroup) : null,
      overrideWinRate: overview.performanceDashboard.overrideStats?.totalCount
        ? overview.performanceDashboard.overrideStats.winRate : null,
      overrideAvgReturn: overview.performanceDashboard.overrideStats?.totalCount
        ? overview.performanceDashboard.overrideStats.averageReturn : null,
      overrideCount: overview.performanceDashboard.overrideStats?.totalCount ?? 0,
      alerts: overview.performanceDashboard.alerts,
      tuningSuggestions: overview.performanceDashboard.tuningSuggestions,
    }
  }

  const latestWeek = overview.weeklySummary[0]
  const bestGroup = [...overview.modelGroupPerformance].sort((left, right) => right.winRate - left.winRate)[0] ?? null
  const worstGroup = [...overview.modelGroupPerformance].sort((left, right) => left.winRate - right.winRate)[0] ?? null
  const winRate = latestWeek?.winRate ?? overview.stats.winRate
  const profitLossRatio = latestWeek?.averageProfitLossRatio && latestWeek.averageProfitLossRatio > 0
    ? latestWeek.averageProfitLossRatio
    : calculateProfitLossRatio(overview.recentTrades)
  const watchAccuracy = calculateWatchAccuracy(overview)
  const sharpeLike = calculateSharpeLike(overview.recentTrades)
  const alerts: string[] = []
  const tuningSuggestions: string[] = []

  if (winRate < 0.45) {
    alerts.push('胜率低于 45%，当前策略进入谨慎区')
  }
  if (overview.stats.maxDrawdown <= -10) {
    alerts.push('最大回撤已接近月度风控阈值，需减少进攻性')
  }
  if (worstGroup && worstGroup.winRate < 0.45) {
    alerts.push(`${formatModelGroupLabel(worstGroup.group)} 连续表现偏弱，建议降低权重`)
  }

  const regime = overview.marketRegime ?? deriveMarketRegime(overview.marketState)
  const threshold = config?.marketThresholds[regime]?.minCompositeScore ?? null
  if (winRate < 0.45 && threshold !== null) {
    tuningSuggestions.push(`min_composite_score: ${threshold} → ${threshold + 3}`)
  }
  if (worstGroup && worstGroup.winRate < 0.45) {
    tuningSuggestions.push(`${worstGroup.group}_expert_weight: ${worstGroup.weight.toFixed(2)} → ${Math.max(0.5, worstGroup.weight - 0.2).toFixed(2)}`)
  }
  if (watchAccuracy < 0.6) {
    tuningSuggestions.push('观望准确率偏低，需复核 Conviction Filter 观望阈值')
  }

  return {
    winRate,
    profitLossRatio,
    weeklyReturn: latestWeek?.weeklyReturn ?? overview.stats.weeklyReturn,
    cumulativeReturn: overview.stats.cumulativeReturn,
    maxDrawdown: overview.stats.maxDrawdown,
    sharpeLike,
    watchAccuracy,
    tradeCount: latestWeek?.tradeCount ?? overview.recentTrades.length,
    watchDays: latestWeek?.watchDays ?? overview.watchLogs.length,
    bestGroup: bestGroup ? formatModelGroupLabel(bestGroup.group) : null,
    worstGroup: worstGroup ? formatModelGroupLabel(worstGroup.group) : null,
    overrideWinRate: null,
    overrideAvgReturn: null,
    overrideCount: 0,
    alerts,
    tuningSuggestions,
  }
}

export function buildBehaviorProfileSummary(overview: StockAnalysisOverview): BehaviorProfileSummary {
  const totalSignals = overview.topSignals.length
  const executionCount = overview.topSignals.filter((signal) => signal.decisionSource === 'user_confirmed').length
  const rejectCount = overview.topSignals.filter((signal) => signal.decisionSource === 'user_rejected').length
  const ignoreCount = overview.topSignals.filter((signal) => signal.decisionSource === 'user_ignored').length
  const overrideCount = overview.topSignals.filter((signal) => signal.decisionSource === 'user_override').length
  const watchRate = safeDivide(overview.stats.watchSignals, overview.stats.candidatePoolSize)
  const disciplineScore = Math.round(
    (safeDivide(executionCount, totalSignals || 1) * 40)
    + ((1 - safeDivide(ignoreCount, totalSignals || 1)) * 30)
    + ((1 - safeDivide(rejectCount, totalSignals || 1)) * 20)
    + ((watchRate > 0.3 ? 1 : 0.6) * 10),
  )

  return {
    executionRate: safeDivide(executionCount, totalSignals),
    ignoreRate: safeDivide(ignoreCount, totalSignals),
    rejectRate: safeDivide(rejectCount, totalSignals),
    overrideRate: safeDivide(overrideCount, totalSignals),
    watchRate,
    disciplineScore,
  }
}

export function watchOutcomeLabel(outcome: 'correct' | 'wrong' | 'pending') {
  switch (outcome) {
    case 'correct': return '观望正确'
    case 'wrong': return '观望失误'
    case 'pending': return '待评估'
  }
}

export function buildConvictionStats(signals: StockAnalysisSignal[], marketState: StockAnalysisMarketState) {
  const strongBuyCount = signals.filter((signal) => signal.action === 'strong_buy').length
  const buyCount = signals.filter((signal) => signal.action === 'buy').length
  const watchCount = signals.filter((signal) => signal.action === 'watch').length
  const avgScore = average(signals.map((signal) => signal.finalScore))
  const threshold = signals[0]?.thresholds ?? null

  return {
    strongBuyCount,
    buyCount,
    watchCount,
    avgScore,
    thresholdSummary: threshold
      ? `当前 ${marketState.trend} 门槛：综合 ${threshold.minCompositeScore} / 专家 ${threshold.minExpertConsensus} / 技术 ${threshold.minTechnicalScore} / 量化 ${threshold.minQuantScore}`
      : '当前暂无可计算的 Conviction Filter 阈值',
  }
}

// ---------- 绩效图表数据准备 ----------

export interface ChartDataPoint {
  label: string
  value: number
}

/** 从周报数组构建累计收益折线数据（按时间正序，最新在右） */
export function buildCumulativeReturnChartData(overview: StockAnalysisOverview): ChartDataPoint[] {
  const weeks = [...overview.weeklySummary].reverse()
  return weeks.map((week) => ({
    label: week.weekLabel,
    value: week.cumulativeReturn,
  }))
}

/** 从周报数组构建最大回撤折线数据（按时间正序） */
export function buildDrawdownChartData(overview: StockAnalysisOverview): ChartDataPoint[] {
  const weeks = [...overview.weeklySummary].reverse()
  return weeks.map((week) => ({
    label: week.weekLabel,
    value: week.maxDrawdown,
  }))
}

/** 从周报数组构建胜率趋势折线数据（按时间正序） */
export function buildWinRateChartData(overview: StockAnalysisOverview): ChartDataPoint[] {
  const weeks = [...overview.weeklySummary].reverse()
  return weeks.map((week) => ({
    label: week.weekLabel,
    value: week.winRate * 100,
  }))
}

/** 从周报数组构建每周收益柱状图数据（按时间正序） */
export function buildWeeklyReturnChartData(overview: StockAnalysisOverview): ChartDataPoint[] {
  const weeks = [...overview.weeklySummary].reverse()
  return weeks.map((week) => ({
    label: week.weekLabel,
    value: week.weeklyReturn,
  }))
}
