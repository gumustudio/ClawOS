export type MarketTrend = 'bull_trend' | 'bear_trend' | 'range_bound'
export type MarketVolatility = 'high_volatility' | 'normal_volatility' | 'low_volatility'
export type MarketRegime = 'bull_trend' | 'bear_trend' | 'high_volatility' | 'low_volatility_range' | 'normal_range'
export type MarketLiquidity = 'high_liquidity' | 'normal_liquidity' | 'low_liquidity'
export type MarketSentiment = 'optimistic' | 'neutral' | 'pessimistic'
export type MarketStyle = 'large_cap' | 'small_cap' | 'balanced'
export type SignalAction = 'strong_buy' | 'buy' | 'watch' | 'sell' | 'hold' | 'none'
export type PositionAction = 'hold' | 'reduce' | 'take_profit' | 'stop_loss' | 'swap' | 'review'
export type TradeAction = 'buy' | 'sell'
export type DecisionSource = 'system' | 'user_confirmed' | 'user_rejected' | 'user_ignored' | 'user_override' | 'system_auto_buy' | 'system_auto_ignore'
export type StockAnalysisRunState = 'idle' | 'running' | 'success' | 'failed'
export type StockAnalysisDataState = 'empty' | 'ready' | 'stale'
export type StockAnalysisWatchOutcome = 'correct' | 'wrong' | 'pending'

export interface StockAnalysisWatchlistCandidate {
  code: string
  name: string
  market: 'sh' | 'sz' | 'bj'
  exchange: string
  industryName?: string | null
}

export interface StockAnalysisKlinePoint {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  turnover: number
  amplitude: number
  changePercent: number
  changeAmount: number
  turnoverRate: number
}

export interface StockAnalysisSpotQuote {
  code: string
  name: string
  industryName?: string | null
  latestPrice: number
  changePercent: number
  turnoverRate: number
  high: number
  low: number
  open: number
  previousClose: number
  totalMarketCap: number
  circulatingMarketCap: number
}

/**
 * v1.30.2: 信号实时行情快照
 * 用于与 snapshot（信号生成时的历史基准）分离，让前端展示实时价格时不污染历史数据。
 * 盘中由 cron 每 5 分钟刷新一次；盘前/节假日为 null。
 */
export interface StockAnalysisSignalRealtime {
  latestPrice: number
  changePercent: number
  open: number
  high: number
  low: number
  previousClose: number
  /** 数据抓取时间（ISO 8601），用于前端展示"XX:XX 更新" */
  fetchedAt: string
}

export interface StockAnalysisMarketState {
  asOfDate: string
  trend: MarketTrend
  volatility: MarketVolatility
  liquidity: MarketLiquidity
  sentiment: MarketSentiment
  style: MarketStyle
  csi500Return20d: number
  annualizedVolatility20d: number
  averageTurnover20d: number
  risingRatio: number
  /** 波动率在252日历史中的百分位 (0-1)，用于市场级风控 */
  volatilityPercentile?: number
  /** 成交量在252日历史中的百分位 (0-1)，用于市场级风控 */
  volumePercentile?: number
}

export interface StockAnalysisStockSnapshot {
  code: string
  name: string
  market: 'sh' | 'sz' | 'bj'
  exchange: string
  sector: string
  latestPrice: number
  changePercent: number
  open: number
  high: number
  low: number
  previousClose: number
  turnoverRate: number
  totalMarketCap: number
  circulatingMarketCap: number
  averageTurnoverAmount20d: number
  amplitude20d: number
  declineDays20d: number
  return5d: number
  return20d: number
  return60d: number
  return120d: number
  momentumRank20d: number | null
  momentumRank60d: number | null
  volumeBreakout: number
  volatility20d: number
  volatilityRank: number
  pricePosition20d: number
  movingAverage5: number
  movingAverage20: number
  movingAverage60: number
  movingAverage120: number
  movingAverage20Slope: number
  movingAverage60Slope: number
  rsi14: number | null
  macdLine: number | null
  macdSignal: number | null
  macdHistogram: number | null
  atr14: number | null
  atrPercent: number | null
  distanceToResistance1: number | null
  distanceToSupport1: number | null
  industryStrength: number | null
  industryBreadth: number | null
  industryReturn20d: number | null
  industryReturn60d: number | null
  industryTrendStrength: number | null
  scoreReason: string[]
}

export interface StockAnalysisThresholds {
  minCompositeScore: number
  minExpertConsensus: number
  minTechnicalScore: number
  minQuantScore: number
}

export interface StockAnalysisFusionWeights {
  expert: number
  technical: number
  quant: number
}

export interface StockAnalysisExpertVote {
  expertId: string
  expertName: string
  layer: StockAnalysisExpertLayer
  stance: StockAnalysisExpertStance
  verdict: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  reason: string
  modelId: string
  /** 实际调用的供应商 ID（fallback 时可能与 assignedModel 不同） */
  providerId?: string
  /** 实际调用的供应商名称 */
  providerName?: string
  /** 专家配置中原始分配的模型 ID（不受 fallback 影响） */
  assignedModelId?: string
  usedFallback: boolean
  latencyMs: number
}

export interface StockAnalysisExpertScore {
  bullishCount: number
  bearishCount: number
  neutralCount: number
  consensus: number
  score: number
  highlights: string[]
  risks: string[]
  /** 各专家的详细投票（LLM 接入后填充，旧公式模式下为空数组） */
  votes: StockAnalysisExpertVote[]
  /** 成功调用 LLM 的专家数（主模型 + fallback LLM 都算成功） */
  llmSuccessCount: number
  /** 使用 fallback LLM 模型成功的专家数 */
  llmFallbackCount?: number
  /** 完全降级为规则引擎推断的专家数 */
  ruleFallbackCount?: number
  /** @deprecated 向后兼容：等于 llmFallbackCount + ruleFallbackCount */
  fallbackCount: number
  /** 是否全部为模拟数据（零 LLM 成功，全部规则引擎） */
  isSimulated: boolean
}

export interface StockAnalysisTechnicalScore {
  total: number
  trend: number
  momentumConfirmation: number
  structure: number
  participation: number
  risk: number
  absolute: number
  relative: number
  sector: number
  notes: string[]
}

export interface StockAnalysisQuantScore {
  total: number
  mediumTermMomentum: number
  crossSectionalStrength: number
  liquidityQuality: number
  stability: number
  meanReversion: number
  momentum: number
  volumeBreakout: number
  volatility: number
  liquidity: number
  value: number
  notes: string[]
}

export interface StockAnalysisSignal {
  id: string
  tradeDate: string
  code: string
  name: string
  latestPrice: number
  sector: string
  snapshot: StockAnalysisStockSnapshot
  expert: StockAnalysisExpertScore
  technical: StockAnalysisTechnicalScore
  quant: StockAnalysisQuantScore
  marketState: StockAnalysisMarketState
  marketRegime: MarketRegime
  fusionWeights: StockAnalysisFusionWeights
  thresholds: StockAnalysisThresholds
  compositeScore: number
  scoreBonus: number
  finalScore: number
  action: SignalAction
  suggestedPosition: number
  suggestedPriceRange: { min: number; max: number }
  /** M7: 基于支撑/压力位计算的关键价位 */
  supportResistance: SupportResistanceLevels | null
  stopLossPrice: number
  takeProfitPrice1: number
  takeProfitPrice2: number
  passingChecks: string[]
  vetoReasons: string[]
  watchReasons: string[]
  reasoning: string[]
  confidence: number
  createdAt: string
  decisionSource: DecisionSource
  userDecisionNote: string | null
  /**
   * v1.30.2: 盘中实时行情（与 snapshot 分离，snapshot 保持为信号生成时刻的历史基准）
   * 为 null 表示盘前/节假日尚未刷新。
   */
  realtime?: StockAnalysisSignalRealtime | null
}

export interface StockAnalysisPosition {
  id: string
  code: string
  name: string
  openedAt: string
  openDate: string
  sourceSignalId: string | null
  quantity: number
  weight: number
  costPrice: number
  currentPrice: number
  returnPercent: number
  holdingDays: number
  stopLossPrice: number
  takeProfitPrice1: number
  takeProfitPrice2: number
  trailingStopEnabled: boolean
  highestPriceSinceOpen: number
  action: PositionAction
  actionReason: string
  /** 用户已忽略的 action 类型，防止 overview 重新计算时覆盖 dismiss 状态 */
  dismissedAction?: PositionAction | null
}

export interface StockAnalysisTradeRecord {
  id: string
  action: TradeAction
  code: string
  name: string
  tradeDate: string
  price: number
  quantity: number
  weight: number
  sourceSignalId: string | null
  sourceDecision: DecisionSource
  note: string
  relatedPositionId: string | null
  pnlPercent: number | null
  buyDate?: string | null
  sellDate?: string | null
}

export interface StockAnalysisWatchLogEntry {
  id: string
  tradeDate: string
  highestSignalScore: number
  reason: string
  topCandidateCode: string | null
  topCandidateName: string | null
  tPlus1Return: number | null
  tPlus5Return: number | null
  outcome: StockAnalysisWatchOutcome
  evaluatedAt: string | null
  createdAt: string
}

export interface StockAnalysisMonthlySummary {
  monthLabel: string
  tradeCount: number
  watchDays: number
  winRate: number
  monthlyReturn: number
  cumulativeReturn: number
  maxDrawdown: number
}

export interface StockAnalysisOverrideStats {
  /** override 总笔数（已平仓） */
  totalCount: number
  /** override 盈利笔数 */
  winCount: number
  /** override 胜率 (0-1) */
  winRate: number
  /** override 平均收益率 (%) */
  averageReturn: number
  /** 同期 system 推荐交易的胜率 (0-1)，用于对比 */
  systemWinRate: number
  /** 同期 system 推荐交易的平均收益率 (%) */
  systemAverageReturn: number
}

export interface StockAnalysisPerformanceDashboard {
  convictionPassRate: number
  watchAccuracy: number
  sharpeLike: number
  bestModelGroup: StockAnalysisModelGroupPerformance['group'] | null
  worstModelGroup: StockAnalysisModelGroupPerformance['group'] | null
  overrideStats: StockAnalysisOverrideStats
  alerts: string[]
  tuningSuggestions: string[]
}

export interface StockAnalysisWeeklySummary {
  weekLabel: string
  tradeCount: number
  watchDays: number
  winRate: number
  averageProfitLossRatio: number
  weeklyReturn: number
  cumulativeReturn: number
  maxDrawdown: number
}

export interface StockAnalysisModelGroupPerformance {
  /** 分组键，格式为 "providerId/modelId" 或 "rules" */
  group: string
  /** 模型 ID（如 glm-5） */
  modelId?: string
  /** 供应商 ID */
  providerId?: string
  /** 供应商名称（如 Aliyun、OpenCodeGo） */
  providerName?: string
  /** 显示名称（如 "glm-5 (ZHIPU)"） */
  displayName?: string
  predictionCount: number
  winRate: number
  averageConfidence: number
  calibration: number
  weight: number
  isSimulated: boolean
}

export interface StockAnalysisCurrentRun {
  startedAt: string
  phase: 'bootstrap' | 'stock_pool' | 'quotes' | 'market_state' | 'history' | 'signals' | 'persist'
  processedCount: number
  totalCount: number
}

export interface StockAnalysisOverview {
  generatedAt: string
  tradeDate: string
  stockAnalysisDir: string
  marketState: StockAnalysisMarketState
  marketRegime: MarketRegime
  fusionWeights: StockAnalysisFusionWeights
  stats: {
    stockPoolSize: number
    candidatePoolSize: number
    passingSignals: number
    watchSignals: number
    openPositions: number
    tradeRecords: number
    cumulativeReturn: number
    weeklyReturn: number
    winRate: number
    maxDrawdown: number
    maxPositions: number
  }
  topSignals: StockAnalysisSignal[]
  positions: StockAnalysisPosition[]
  recentTrades: StockAnalysisTradeRecord[]
  watchLogs: StockAnalysisWatchLogEntry[]
  weeklySummary: StockAnalysisWeeklySummary[]
  monthlySummary: StockAnalysisMonthlySummary[]
  modelGroupPerformance: StockAnalysisModelGroupPerformance[]
  performanceDashboard: StockAnalysisPerformanceDashboard
  recentReviews: StockAnalysisReviewRecord[]
  riskEvents: StockAnalysisRiskEvent[]
  riskLimits: StockAnalysisPortfolioRiskLimits
  learnedWeights: StockAnalysisLearnedWeights | null
  expertPerformance: StockAnalysisExpertPerformanceData | null
  thresholdHistory: StockAnalysisThresholdAdjustment[]
  marketLevelRisk: MarketLevelRiskState
  positionEvaluations: StockAnalysisPositionEvaluation[]
  swapSuggestions: StockAnalysisSwapSuggestion[]
  notifications: AutoReportNotification[]
  systemStatus: {
    lastRunAt: string | null
    lastSuccessAt: string | null
    lastError: string | null
    stockPoolRefreshedAt: string | null
    latestSignalDate: string | null
    runState: StockAnalysisRunState
    currentRun: StockAnalysisCurrentRun | null
    dataState: StockAnalysisDataState
    staleReasons: string[]
    quoteCacheAt: string | null
    indexHistoryCacheAt: string | null
    isUsingFallback: boolean
    riskControl: StockAnalysisRiskControlState
    postMarketAt: string | null
    intradayMonitor: {
      state: IntradayMonitorState
      lastPollAt: string | null
      pollCount: number
      activeAlertCount: number
      startedAt: string | null
    }
  }
}

export interface StockAnalysisRuntimeStatus {
  lastRunAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  stockPoolRefreshedAt: string | null
  latestSignalDate: string | null
  runState: StockAnalysisRunState
  currentRun: StockAnalysisCurrentRun | null
  quoteCacheAt: string | null
  indexHistoryCacheAt: string | null
  latestSuccessfulSignalDate: string | null
  isUsingFallback: boolean
  staleReasons: string[]
  riskControl: StockAnalysisRiskControlState
  postMarketAt: string | null
}

export interface StockAnalysisStrategyConfig {
  maxPositions: number
  maxSinglePosition: number
  maxTotalPosition: number
  stopLossPercent: number
  takeProfitPercent1: number
  takeProfitPercent2: number
  maxHoldDays: number
  minTurnoverAmount20d: number
  minAmplitude20d: number
  maxContinuousDeclineDays: number
  marketThresholds: Record<MarketRegime, StockAnalysisThresholds>
  fusionWeightsByRegime: Record<MarketRegime, StockAnalysisFusionWeights>
  lowLiquidityGuardrail: {
    volumePercentileThreshold: number
    crisisRisingRatioThreshold: number
    scorePenalty: number
    maxPositionRatio: number
    crisisMaxPositionRatio: number
  }
  trailingStop: StockAnalysisTrailingStopConfig
  portfolioRiskLimits: StockAnalysisPortfolioRiskLimits
}

export interface StockAnalysisDailyRunResult {
  tradeDate: string
  generatedAt: string
  marketState: StockAnalysisMarketState
  stockPoolSize: number
  candidatePoolSize: number
  signalCount: number
  watchCount: number
  topSignals: StockAnalysisSignal[]
  positionEvaluations: StockAnalysisPositionEvaluation[]
  swapSuggestions: StockAnalysisSwapSuggestion[]
  usedFallbackData: boolean
  staleReasons: string[]
}

export interface StockAnalysisTradeRequest {
  quantity: number
  weight?: number
  price?: number
  note?: string
}

export interface StockAnalysisDecisionRequest {
  note: string
}

export interface StockAnalysisHealthStatus {
  ok: boolean
  dataState: StockAnalysisDataState
  runState: StockAnalysisRunState
  lastSuccessAt: string | null
  latestSignalDate: string | null
  staleReasons: string[]
  isUsingFallback: boolean
}

export interface StockAnalysisQuoteCache {
  fetchedAt: string
  quotes: StockAnalysisSpotQuote[]
}

export interface StockAnalysisIndexHistoryCache {
  fetchedAt: string
  items: Array<{ 日期: string; 收盘: number; 成交额: number }>
}

export interface StockAnalysisHistoryCache {
  fetchedAt: string
  latestDate: string | null
  items: StockAnalysisKlinePoint[]
}

export interface StockAnalysisStockPoolCacheMeta {
  refreshedAt: string | null
}

export interface StockAnalysisRiskControlState {
  paused: boolean
  pauseReason: string | null
  pausedAt: string | null
  dailyLossPercent: number
  weeklyLossPercent: number
  monthlyLossPercent: number
  maxDrawdownPercent: number
  dailyLossBreached: boolean
  weeklyLossBreached: boolean
  monthlyLossBreached: boolean
  maxDrawdownBreached: boolean
  lastCheckedAt: string | null
}

export interface StockAnalysisTrailingStopConfig {
  activationPercent: number
  pullbackPercent: number
}

export interface StockAnalysisPortfolioRiskLimits {
  maxDailyLossPercent: number
  maxWeeklyLossPercent: number
  maxMonthlyLossPercent: number
  maxDrawdownPercent: number
}

export type PositionSellReason =
  | 'score_drop'         // 综合评分大幅下降（低于买入时 -15）
  | 'expert_bearish'     // 专家共识转空 + 技术破位
  | 'swap_candidate'     // 换仓候选（更强标的可替换）

export interface StockAnalysisPositionEvaluation {
  positionId: string
  code: string
  name: string
  currentExpertScore: number
  currentTechnicalScore: number
  currentQuantScore: number
  currentCompositeScore: number
  currentFinalScore: number
  buyCompositeScore: number
  buyFinalScore: number
  scoreDelta: number
  expertConsensus: number
  technicalBreakdown: boolean
  sellRecommended: boolean
  sellReason: PositionSellReason | null
  sellReasonText: string
  reasoning: string[]
}

export interface StockAnalysisSwapSuggestion {
  sellPositionId: string
  sellCode: string
  sellName: string
  sellCurrentScore: number
  buySignalId: string
  buyCode: string
  buyName: string
  buyFinalScore: number
  scoreDifference: number
  reasoning: string
}

export interface StockAnalysisReviewRecord {
  id: string
  tradeDate: string
  code: string
  name: string
  action: 'sell'
  buySignalId: string | null
  buyDate: string
  buyPrice: number
  sellPrice: number
  holdingDays: number
  pnlPercent: number
  buyExpertScore: number
  buyTechnicalScore: number
  buyQuantScore: number
  buyCompositeScore: number
  buyMarketRegime: MarketRegime | null
  sellReason: string
  lessonsLearned: string[]
  createdAt: string
  /** Phase 4.3: 四维复盘分析 */
  dimensionAnalysis?: StockAnalysisDimensionAnalysis
}

/** 四维复盘分析结果 */
export interface StockAnalysisDimensionAnalysis {
  expert: {
    predicted: 'bullish' | 'bearish' | 'neutral'
    actual: 'up' | 'down' | 'flat'
    correct: boolean
    note: string
  }
  technical: {
    buyScore: number
    sellScore: number
    priceHitTarget: boolean
    note: string
  }
  quant: {
    buyScore: number
    momentumCorrect: boolean
    note: string
  }
  execution: {
    slippage: number
    holdingEfficiency: number
    followedPlan: boolean
    note: string
  }
}

/** Phase 4.1: 学习权重记录 */
export interface StockAnalysisLearnedWeights {
  updatedAt: string
  sampleCount: number
  dimensionAccuracy: {
    expert: number
    technical: number
    quant: number
  }
  adjustmentFactors: {
    expert: number
    technical: number
    quant: number
  }
  history: StockAnalysisWeightUpdateEntry[]
}

export interface StockAnalysisWeightUpdateEntry {
  timestamp: string
  sampleCount: number
  winRate: number
  dimensionAccuracy: {
    expert: number
    technical: number
    quant: number
  }
  adjustmentFactors: {
    expert: number
    technical: number
    quant: number
  }
}

/** Phase 6: 专家个体表现追踪 */
export interface StockAnalysisExpertPerformanceEntry {
  expertId: string
  expertName: string
  layer: StockAnalysisExpertLayer
  /** 预测总次数 */
  predictionCount: number
  /** 判断正确次数（bullish+涨 或 bearish+跌） */
  correctCount: number
  /** 胜率 = correctCount / predictionCount */
  winRate: number
  /** 平均置信度 (0-100) */
  averageConfidence: number
  /** 校准度：置信度与实际胜率的偏差绝对值，越小越好 */
  calibration: number
  /** 动态权重 (0.1-2.0)，基于胜率和衰减 */
  weight: number
  /** 最后一次预测的日期 */
  lastPredictionDate: string
  /** 最近预测结果（用于衰减计算），最多保留 50 条 */
  recentOutcomes: StockAnalysisExpertOutcome[]
}

export interface StockAnalysisExpertOutcome {
  tradeDate: string
  code: string
  verdict: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  /** 实际收益率（正=涨/负=跌） */
  actualReturnPercent: number
  /** 预测是否正确 */
  correct: boolean
}

export interface StockAnalysisExpertPerformanceData {
  updatedAt: string
  entries: StockAnalysisExpertPerformanceEntry[]
}

/** Phase 4.2: 阈值调整记录 */
export interface StockAnalysisThresholdAdjustment {
  timestamp: string
  recentWinRate: number
  sampleCount: number
  previousMinCompositeScore: number
  newMinCompositeScore: number
  adjustment: number
  regime: MarketRegime
  reason: string
}

export interface StockAnalysisThresholdHistory {
  updatedAt: string
  adjustments: StockAnalysisThresholdAdjustment[]
}

export type StockAnalysisRiskEventType =
  | 'daily_loss_breached'
  | 'weekly_loss_breached'
  | 'monthly_loss_breached'
  | 'max_drawdown_breached'
  | 'pause_triggered'
  | 'pause_lifted'
  | 'trailing_stop_triggered'
  | 'veto_max_positions'
  | 'veto_blacklist'
  | 'veto_paused'

export interface StockAnalysisRiskEvent {
  id: string
  timestamp: string
  eventType: StockAnalysisRiskEventType
  reason: string
  metrics: {
    dailyLossPercent?: number
    weeklyLossPercent?: number
    monthlyLossPercent?: number
    maxDrawdownPercent?: number
  }
  relatedCode?: string
  relatedPositionId?: string
}

// ==================== Phase 5: AI 配置系统 ====================

/** AI 供应商（支持 OpenAI 兼容协议的 API 提供方） */
export interface StockAnalysisAIProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  /** 该供应商的最大并发请求数（默认 3） */
  concurrency: number
  /** [L5] 该供应商的 max_tokens 上限（默认 200000，部分模型可能需要更小值） */
  maxTokens?: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/** 全局模型池中的一个可用模型（供应商 + 模型名的组合） */
export interface StockAnalysisAIModelRef {
  providerId: string
  providerName: string
  modelId: string
  /** 展示用：如 "gpt-4o (OpenRouter)" */
  displayName: string
}

/** 分析层定义 */
export type StockAnalysisExpertLayer =
  | 'industry_chain'
  | 'company_fundamentals'
  | 'sell_side_research'
  | 'world_power'
  | 'global_macro'
  | 'risk_governance'
  | 'sentiment'
  | 'market_trading'
  | 'buy_side'
  | 'rule_functions'

/** 立场预设 */
export type StockAnalysisExpertStance = 'bullish' | 'bearish' | 'neutral'

/** 单个专家定义 */
export interface StockAnalysisExpertDefinition {
  id: string
  name: string
  layer: StockAnalysisExpertLayer
  stance: StockAnalysisExpertStance
  /** 分配的模型（null 表示使用规则引擎或未配置） */
  assignedModel: StockAnalysisAIModelRef | null
  /** 该专家关注的信息子集关键词，用于筛选传给 LLM 的数据维度 */
  infoSubset: string[]
  /** @deprecated 已被 systemPrompt 取代，保留向后兼容 */
  frameworkPrompt: string
  /** 完整的系统提示词（角色设定 + 分析框架 + 决策逻辑），为空时回退到旧版 layer+stance 拼接 */
  systemPrompt: string
  enabled: boolean
}

/** 分析层配置：整层的模型分配 */
export interface StockAnalysisLayerAssignment {
  layer: StockAnalysisExpertLayer
  layerName: string
  defaultModel: StockAnalysisAIModelRef | null
  expertCount: number
}

/** LLM 提取 Agent ID */
export type LLMExtractionAgentId = 'announcement_parser' | 'news_impact_analyzer' | 'sentiment_analyzer'

/** 单个 LLM 提取 Agent 的模型配置 */
export interface LLMExtractionAgentConfig {
  agentId: LLMExtractionAgentId
  label: string
  /** 分配的首选模型（null 表示使用第一个可用 provider 的第一个模型） */
  assignedModel: StockAnalysisAIModelRef | null
  enabled: boolean
}

/** AI 配置的完整持久化结构 */
export interface StockAnalysisAIConfig {
  version: number
  updatedAt: string
  providers: StockAnalysisAIProvider[]
  experts: StockAnalysisExpertDefinition[]
  layerAssignments: StockAnalysisLayerAssignment[]
  /** LLM 提取 Agent 的模型配置（per-agent 可选分配 + 自动 fallback） */
  extractionAgents: LLMExtractionAgentConfig[]
}

/** 模型连通性测试结果 */
export interface StockAnalysisModelTestResult {
  providerId: string
  modelId: string
  success: boolean
  latencyMs: number
  error: string | null
  testedAt: string
}

// ==================== Phase 4+5: 新增类型 ====================

/** M7: 支撑/压力位 */
export interface SupportResistanceLevels {
  support1: number
  support2: number
  resistance1: number
  resistance2: number
  method: 'ma_pivot_volume'
}

/** 市场级风控状态 */
export interface MarketLevelRiskState {
  /** 极端熊市：20日跌幅>10%，暂停所有新开仓 */
  extremeBearActive: boolean
  /** 极端波动：波动率>95th百分位，仓位上限降至50% */
  extremeVolatilityActive: boolean
  /** 流动性危机：缩量 + 普跌 + 悲观情绪共振，仅允许卖出 */
  liquidityCrisisActive: boolean
  /** 成交额分位偏低，但未达到全面危机，触发降仓位而不是禁买 */
  lowLiquidityActive: boolean
  /** 有效最大仓位比例（正常0.85，低流动性0.65，极端波动0.50，流动性危机0.35） */
  effectiveMaxPositionRatio: number
  /** 是否允许新开仓 */
  newPositionsAllowed: boolean
  /** 是否允许买入 */
  buyAllowed: boolean
  checkedAt: string
}

/** 数据采集代理 ID */
export type DataAgentId =
  | 'macro_economy' | 'policy_regulation' | 'company_info'
  | 'price_volume' | 'industry_news' | 'social_sentiment'
  | 'global_markets' | 'data_quality'

/** 数据采集代理运行结果 */
export interface DataAgentResult {
  agentId: DataAgentId
  collectedAt: string
  dataPointCount: number
  successRate: number
  elapsedMs: number
  errors: string[]
}

/** 宏观经济数据 */
export interface MacroEconomicData {
  date: string
  gdpGrowth: number | null
  cpi: number | null
  pmi: number | null
  interestRate: number | null
  exchangeRateUsdCny: number | null
  treasuryYield10y: number | null
}

/** 政策事件 */
export interface PolicyEvent {
  id: string
  source: string
  title: string
  publishedAt: string
  category: 'monetary_policy' | 'regulatory' | 'industry' | 'fiscal' | 'other'
  rawText: string
  affectedSectors: string[]
}

/** 上市公司公告 */
export interface CompanyAnnouncement {
  code: string
  name: string
  title: string
  publishedAt: string
  category: 'earnings' | 'insider_trading' | 'equity_change' | 'litigation' | 'other'
  importance: 'major' | 'normal' | 'routine'
  rawText: string
}

/** 行业新闻 */
export interface IndustryNewsItem {
  id: string
  title: string
  source: string
  publishedAt: string
  sectors: string[]
  rawSummary: string
}

/** 社交媒体情绪快照 */
export interface SocialSentimentSnapshot {
  collectedAt: string
  platform: 'xueqiu' | 'guba' | 'weibo' | 'eastmoney_hot'
  sourceKind: 'primary_sentiment' | 'supplementary_heat'
  summary: string
  hotTopics: string[]
  overallBullBearRatio: { bull: number; bear: number; neutral: number }
  topMentionedStocks: Array<{ code: string; mentionCount: number; sentiment: number }>
}

/** 全球市场快照 */
export interface GlobalMarketSnapshot {
  collectedAt: string
  sp500Change: number | null
  nasdaqChange: number | null
  hsiChange: number | null
  a50FuturesChange: number | null
  usdCnyRate: number | null
  crudeOilChange: number | null
  goldChange: number | null
  us10yYieldChange: number | null
}

/** 数据质量报告 */
export interface DataQualityReport {
  checkedAt: string
  agentResults: Array<{
    agentId: DataAgentId
    isComplete: boolean
    missingFields: string[]
    anomalies: string[]
    reliabilityScore: number
  }>
  overallScore: number
}

/** [H5] 资金流向数据（个股级） */
export interface MoneyFlowItem {
  /** 股票代码 */
  code: string
  /** 股票名称 */
  name: string
  /** 主力净流入(万) */
  mainNetInflow: number
  /** 涨跌幅(%) */
  changePercent: number
}

/** [H5] 板块资金流向 */
export interface SectorFlowItem {
  /** 板块名称 */
  sectorName: string
  /** 板块净流入(万) */
  netInflow: number
}

/** [H5] 龙虎榜概要 */
export interface DragonTigerSummary {
  /** 上榜股票数量 */
  stockCount: number
  /** 采集日期 */
  tradeDate: string
}

/** [H5] 大宗交易概要 */
export interface BlockTradeSummary {
  /** 交易笔数 */
  tradeCount: number
  /** 采集日期 */
  tradeDate: string
}

/** [H5] 融资融券概要 */
export interface MarginTradingSummary {
  /** 数据条目数 */
  recordCount: number
  /** 采集日期 */
  tradeDate: string
}

/** [H5] Agent4 价格量能增量数据 */
export interface PriceVolumeExtras {
  /** 个股资金流向 TOP 10 */
  moneyFlow: MoneyFlowItem[]
  /** 板块资金流向 TOP 10 */
  sectorFlow: SectorFlowItem[]
  /** 龙虎榜概要 */
  dragonTiger: DragonTigerSummary | null
  /** 大宗交易概要 */
  blockTrade: BlockTradeSummary | null
  /** 融资融券概要 */
  marginTrading: MarginTradingSummary | null
}

/** 事实池 — 所有数据代理的聚合输出 */
export interface FactPool {
  updatedAt: string
  tradeDate: string
  macroData: MacroEconomicData | null
  policyEvents: PolicyEvent[]
  companyAnnouncements: CompanyAnnouncement[]
  industryNews: IndustryNewsItem[]
  socialSentiment: SocialSentimentSnapshot[]
  globalMarkets: GlobalMarketSnapshot | null
  /** [H5] 价格量能增量数据（资金流向/龙虎榜/大宗交易等） */
  priceVolumeExtras: PriceVolumeExtras | null
  dataQuality: DataQualityReport | null
  agentLogs: DataAgentResult[]
}

/** LLM 提取：公告事件 */
export interface AnnouncementEvent {
  company: string
  eventType: string
  magnitude: string
  sentiment: number
  keyMetrics: Record<string, number>
  riskFlags: string[]
  confidence: number
}

/** LLM 提取：新闻影响事件 */
export interface NewsImpactEvent {
  topic: string
  impactDirection: '利好' | '利空' | '中性'
  impactLevel: '重大' | '中等' | '轻微'
  affectedSectors: string[]
  affectedStocks: string[]
  timeHorizon: '短期' | '中期' | '长期'
  confidence: number
}

/** LLM 提取：舆情指数 */
export interface SentimentIndex {
  overallSentiment: number
  bullRatio: number
  bearRatio: number
  neutralRatio: number
  hotTopics: string[]
  sentimentChange24h: number
  herdingSignal: 'none' | 'moderate' | 'extreme'
}

/** LLM 提取结果汇总 */
export interface LLMExtractionResult {
  extractedAt: string
  tradeDate: string
  announcements: AnnouncementEvent[]
  newsImpacts: NewsImpactEvent[]
  sentimentIndex: SentimentIndex | null
  llmCalls: Array<{
    agent: string
    model: string
    latencyMs: number
    success: boolean
    error: string | null
  }>
}

/** 事件驱动选股结果 */
export interface EventScreenResult {
  code: string
  name: string
  matchedEvents: Array<{
    source: 'announcement' | 'news' | 'sector_anomaly'
    description: string
    sentiment: number
  }>
  priorityScore: number
}

/** 分析运行类型 */
export type StockAnalysisRunType = 'pre_market' | 'post_market'

/** 盘后分析结果 */
export interface StockAnalysisPostMarketResult {
  tradeDate: string
  generatedAt: string
  runType: 'post_market'
  marketState: StockAnalysisMarketState
  positionEvaluations: StockAnalysisPositionEvaluation[]
  riskControlState: StockAnalysisRiskControlState
  reviewsGenerated: number
  factPoolUpdated: boolean
}

/** 盘中监控配置 */
export interface IntradayMonitorConfig {
  enabled: boolean
  pollIntervalMs: number
  tradingHoursStart: string
  tradingHoursEnd: string
  lunchBreakStart: string
  lunchBreakEnd: string
}

/** 盘中告警 */
export interface IntradayAlert {
  id: string
  timestamp: string
  positionId: string
  code: string
  name: string
  alertType: 'stop_loss' | 'take_profit_1' | 'take_profit_2' | 'trailing_stop' | 'daily_loss_limit' | 'max_hold_days' | 'volatility_spike' | 'sector_anomaly'
  currentPrice: number
  triggerPrice: number
  message: string
  acknowledged: boolean
}

/** 盘中监控状态 */
export type IntradayMonitorState = 'idle' | 'running' | 'paused'

/** 盘中监控运行时状态 */
export interface IntradayMonitorStatus {
  state: IntradayMonitorState
  lastPollAt: string | null
  pollCount: number
  alerts: IntradayAlert[]
  startedAt: string | null
}

/** 自动报告通知 */
export interface AutoReportNotification {
  id: string
  type: 'weekly_report' | 'monthly_report'
  generatedAt: string
  periodLabel: string
  title: string
  summary: string
  acknowledged: boolean
}

/** 月度报告 */
export interface MonthlyReport {
  id: string
  monthLabel: string
  generatedAt: string
  metrics: StockAnalysisMonthlySummary
  tuningSuggestions: TuningSuggestion[]
  narrativeSummary: string
}

/** 参数调优建议 */
export interface TuningSuggestion {
  parameter: string
  currentValue: number
  suggestedValue: number
  reason: string
  confidence: 'high' | 'medium' | 'low'
}

// ==================== Phase 10: 专家记忆系统 ====================

/** 单日专家记忆条目（每个专家对某只股票的一次预测记录） */
export interface ExpertDailyMemoryEntry {
  tradeDate: string
  expertId: string
  code: string
  name: string
  verdict: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  reason: string
  /** T+1 实际收益率（盘后回填，未回填时为 null） */
  actualReturnNextDay: number | null
  /** 预测是否正确（回填，未回填时为 null） */
  wasCorrect: boolean | null
}

/** 短期记忆：最近 5 个交易日的详细预测+结果 */
export interface ExpertShortTermMemory {
  entries: ExpertDailyMemoryEntry[]
}

/** 中期记忆：最近 30 个交易日的 LLM 压缩摘要 */
export interface ExpertMidTermMemory {
  /** LLM 压缩生成的文本摘要（~500 字） */
  summary: string
  period: { from: string; to: string }
  winRate: number
  avgConfidence: number
  dominantVerdict: 'bullish' | 'bearish' | 'neutral'
  keyPatterns: string[]
  compressedAt: string
  /** [M12] 累计样本数，用于加权平均（可选，旧数据无此字段时默认 1） */
  sampleCount?: number
}

/** 长期记忆：核心规律和教训 */
export interface ExpertLongTermMemory {
  /** 历史重要教训 (max 20) */
  lessons: string[]
  /** 擅长的市场环境 */
  strengths: string[]
  /** 不擅长的市场环境 */
  weaknesses: string[]
  updatedAt: string
}

/** 专家完整记忆 */
export interface ExpertMemory {
  expertId: string
  shortTerm: ExpertShortTermMemory
  midTerm: ExpertMidTermMemory | null
  longTerm: ExpertLongTermMemory | null
  updatedAt: string
}

/** 全体专家记忆存储 */
export interface ExpertMemoryStore {
  version: number
  updatedAt: string
  memories: Record<string, ExpertMemory>
}

/** 专家画像（注入 system prompt） */
export interface ExpertProfile {
  expertId: string
  expertName: string
  predictionCount: number
  winRate: number
  avgConfidence: number
  /** 校准度：置信度与实际胜率的偏差，越小越好 */
  calibration: number
  bestMarketRegime: string | null
  worstMarketRegime: string | null
  /** 近期连胜/连败描述 */
  recentStreak: string
}

/** FactPool 摘要（注入 user message） */
export interface FactPoolSummary {
  macroSummary: string | null
  policySummary: string | null
  announcementHighlights: string[]
  industryHighlights: string[]
  sentimentSummary: string | null
  globalMarketSummary: string | null
  /** [H5] 资金流向摘要 */
  moneyFlowSummary: string | null
}

// ==================== Phase 11: 数据采集 Agent 配置 ====================

/** 单个数据采集 Agent 的配置 */
export interface DataAgentConfigItem {
  agentId: DataAgentId
  enabled: boolean
  timeoutMs: number
  priority: number
  label: string
}

/** 数据采集 Agent 配置存储 */
export interface DataAgentConfigStore {
  version: number
  updatedAt: string
  agents: DataAgentConfigItem[]
}

// ==================== Phase 12: 自选股票 (Watchlist) ====================

/** 自选股票条目 */
export interface UserWatchlistItem {
  code: string
  name: string
  market: 'sh' | 'sz' | 'bj'
  exchange: string
  industryName: string | null
  /** 用户备注 */
  note: string
  /** 添加时间 ISO 字符串 */
  addedAt: string
}

/** 自选股票实时行情（合并 SpotQuote + K线历史） */
export interface WatchlistQuoteSnapshot {
  code: string
  name: string
  latestPrice: number
  changePercent: number
  open: number
  high: number
  low: number
  previousClose: number
  turnoverRate: number
  totalMarketCap: number
  circulatingMarketCap: number
  /** 成交量（手） — 从 K 线数据推算或行情直接获取 */
  volume: number
  /** 近 N 日 K 线历史（用于分时图） */
  klineHistory: StockAnalysisKlinePoint[]
}

/** 自选股票完整响应（列表 + 实时行情） */
export interface WatchlistResponse {
  items: UserWatchlistItem[]
  quotes: Record<string, WatchlistQuoteSnapshot>
  updatedAt: string
}
