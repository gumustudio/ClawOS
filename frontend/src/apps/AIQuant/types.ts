export type MarketTrend = 'bull_trend' | 'bear_trend' | 'range_bound'
export type MarketVolatility = 'high_volatility' | 'normal_volatility' | 'low_volatility'
export type MarketRegime = 'bull_trend' | 'bear_trend' | 'high_volatility' | 'low_volatility_range' | 'normal_range'
export type MarketLiquidity = 'high_liquidity' | 'normal_liquidity' | 'low_liquidity'
export type MarketSentiment = 'optimistic' | 'neutral' | 'pessimistic'
export type MarketStyle = 'large_cap' | 'small_cap' | 'balanced'
export type SignalAction = 'strong_buy' | 'buy' | 'watch' | 'sell' | 'hold' | 'none'
export type PositionAction = 'hold' | 'reduce' | 'take_profit' | 'stop_loss' | 'swap' | 'review'
export type StockAnalysisRunState = 'idle' | 'running' | 'success' | 'failed'
export type StockAnalysisDataState = 'empty' | 'ready' | 'stale'

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
  volatilityPercentile?: number
  volumePercentile?: number
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

export interface StockAnalysisStockSnapshot {
  code: string
  name: string
  market: 'sh' | 'sz' | 'bj'
  exchange: string
  sector: string
  latestPrice: number
  changePercent: number
  /** 当日开盘价（旧数据可能缺失） */
  open?: number
  /** 当日最高价（旧数据可能缺失） */
  high?: number
  /** 当日最低价（旧数据可能缺失） */
  low?: number
  /** 昨日收盘价（旧数据可能缺失） */
  previousClose?: number
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

export interface StockAnalysisSignal {
  id: string
  tradeDate: string
  code: string
  name: string
  latestPrice: number
  sector: string
  snapshot: StockAnalysisStockSnapshot
  expert: {
    bullishCount: number
    bearishCount: number
    neutralCount: number
    consensus: number
    score: number
    highlights: string[]
    risks: string[]
    votes?: StockAnalysisExpertVote[]
    /** LLM 成功总数（主模型 + fallback LLM） */
    llmSuccessCount?: number
    /** 使用 fallback LLM 模型成功的专家数 */
    llmFallbackCount?: number
    /** 完全降级为规则引擎的专家数 */
    ruleFallbackCount?: number
    /** @deprecated 向后兼容 */
    fallbackCount?: number
    isSimulated?: boolean
    /** 降级比例 0-1：仅基于规则引擎降级。0 = 无规则降级 */
    degradeRatio?: number
  }
  marketState: StockAnalysisMarketState
  marketRegime?: MarketRegime
  fusionWeights?: StockAnalysisFusionWeights
  thresholds: StockAnalysisThresholds
  technical: {
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
  quant: {
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
  compositeScore: number
  scoreBonus: number
  finalScore: number
  action: SignalAction
  suggestedPosition: number
  suggestedPriceRange: { min: number; max: number }
  supportResistance?: SupportResistanceLevels | null
  stopLossPrice: number
  takeProfitPrice1: number
  takeProfitPrice2: number
  passingChecks: string[]
  vetoReasons: string[]
  watchReasons: string[]
  reasoning: string[]
  confidence: number
  createdAt: string
  decisionSource: 'system' | 'user_confirmed' | 'user_rejected' | 'user_ignored' | 'user_override'
  userDecisionNote: string | null
  /**
   * v1.30.2: 盘中实时行情（与 snapshot 分离，snapshot 保持为信号生成时刻的历史基准）
   * 为 null/undefined 表示盘前/节假日尚未刷新，前端应回退到 snapshot/latestPrice 展示
   */
  realtime?: {
    latestPrice: number
    changePercent: number
    open: number
    high: number
    low: number
    previousClose: number
    fetchedAt: string
  } | null
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
}

export interface StockAnalysisTradeRecord {
  id: string
  action: 'buy' | 'sell'
  code: string
  name: string
  tradeDate: string
  price: number
  quantity: number
  weight: number
  sourceSignalId: string | null
  sourceDecision: 'system' | 'user_confirmed' | 'user_rejected' | 'user_ignored' | 'user_override'
  note: string
  relatedPositionId: string | null
  pnlPercent?: number | null
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
  outcome: 'correct' | 'wrong' | 'pending'
  evaluatedAt: string | null
  createdAt: string
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

export interface StockAnalysisMonthlySummary {
  monthLabel: string
  tradeCount: number
  watchDays: number
  winRate: number
  monthlyReturn: number
  cumulativeReturn: number
  maxDrawdown: number
}

export interface StockAnalysisModelGroupPerformance {
  group: string
  modelId?: string
  providerId?: string
  providerName?: string
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
  // [P2-27] 以下字段后端始终返回，移除不必要的 ? 标记以匹配实际 API 契约
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
  performanceDashboard: {
    convictionPassRate: number
    watchAccuracy: number
    sharpeLike: number
    bestModelGroup: StockAnalysisModelGroupPerformance['group'] | null
    worstModelGroup: StockAnalysisModelGroupPerformance['group'] | null
    overrideStats?: {
      totalCount: number
      winCount: number
      winRate: number
      averageReturn: number
      systemWinRate: number
      systemAverageReturn: number
    }
    alerts: string[]
    tuningSuggestions: string[]
  }
  recentReviews: StockAnalysisReviewRecord[]
  riskEvents: StockAnalysisRiskEvent[]
  riskLimits: StockAnalysisPortfolioRiskLimits
  positionEvaluations: StockAnalysisPositionEvaluation[]
  swapSuggestions: StockAnalysisSwapSuggestion[]
  notifications: AutoReportNotification[]
  marketLevelRisk: MarketLevelRiskState | null
  learnedWeights: StockAnalysisLearnedWeights | null
  expertPerformance: StockAnalysisExpertPerformanceData | null
  thresholdHistory: StockAnalysisThresholdAdjustment[]
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

export interface StockAnalysisDailyRunResult {
  tradeDate: string
  generatedAt: string
  marketState: StockAnalysisMarketState
  stockPoolSize: number
  candidatePoolSize: number
  signalCount: number
  watchCount: number
  topSignals: StockAnalysisSignal[]
  usedFallbackData: boolean
  staleReasons: string[]
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
  fusionWeightsByRegime?: Record<MarketRegime, StockAnalysisFusionWeights>
  trailingStop?: StockAnalysisTrailingStopConfig
  portfolioRiskLimits?: StockAnalysisPortfolioRiskLimits
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

export type PositionSellReason =
  | 'score_drop'
  | 'expert_bearish'
  | 'swap_candidate'

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
  dimensionAnalysis?: StockAnalysisDimensionAnalysis
}

export type StockAnalysisRiskEventType =
  | 'daily_loss_breached'
  | 'weekly_loss_breached'
  | 'monthly_loss_breached'
  | 'max_drawdown_breached'
  | 'pause_triggered'
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

export interface StockAnalysisHealthStatus {
  ok: boolean
  dataState: StockAnalysisDataState
  runState: StockAnalysisRunState
  lastSuccessAt: string | null
  latestSignalDate: string | null
  staleReasons: string[]
  isUsingFallback: boolean
}

/** Phase 4.3: 四维复盘分析结果 */
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

// ==================== Phase 5: AI 配置系统 ====================

/** AI 供应商（支持 OpenAI 兼容协议的 API 提供方） */
export interface StockAnalysisAIProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  enabled: boolean
  /** 该供应商的最大并发调用数（默认 3） */
  concurrency: number
  /** 该供应商的 max_tokens 上限（默认 200000） */
  maxTokens?: number
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

/** 单个专家的投票结果 */
export interface StockAnalysisExpertVote {
  expertId: string
  expertName: string
  layer: StockAnalysisExpertLayer
  stance: StockAnalysisExpertStance
  verdict: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  reason: string
  modelId: string
  usedFallback: boolean
  latencyMs: number
}

/** 单个专家定义 */
export interface StockAnalysisExpertDefinition {
  id: string
  name: string
  layer: StockAnalysisExpertLayer
  stance: StockAnalysisExpertStance
  /** 分配的模型（null 表示使用规则引擎或未配置） */
  assignedModel: StockAnalysisAIModelRef | null
  /** 该专家关注的信息子集关键词 */
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
  extractionAgents: LLMExtractionAgentConfig[]
}

/** AI 配置 + 聚合模型池（GET /ai-config 的返回） */
export interface StockAnalysisAIConfigWithPool extends StockAnalysisAIConfig {
  modelPool: StockAnalysisAIModelRef[]
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

/** 专家个体预测结果 */
export interface StockAnalysisExpertOutcome {
  tradeDate: string
  code: string
  verdict: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  actualReturnPercent: number
  correct: boolean
}

/** 专家个体表现条目 */
export interface StockAnalysisExpertPerformanceEntry {
  expertId: string
  expertName: string
  layer: StockAnalysisExpertLayer
  predictionCount: number
  correctCount: number
  winRate: number
  averageConfidence: number
  calibration: number
  weight: number
  lastPredictionDate: string
  recentOutcomes: StockAnalysisExpertOutcome[]
}

/** 专家个体表现汇总数据 */
export interface StockAnalysisExpertPerformanceData {
  updatedAt: string
  entries: StockAnalysisExpertPerformanceEntry[]
}

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
  /** 流动性危机：成交量<10th百分位，仅允许卖出 */
  liquidityCrisisActive: boolean
  /** 有效最大仓位比例（默认1.0，用户已解除仓位比例压制；仅保留极端熊市/流动性危机硬拦截） */
  effectiveMaxPositionRatio: number
  /** 是否允许新开仓 */
  newPositionsAllowed: boolean
  /** 是否允许买入 */
  buyAllowed: boolean
  checkedAt: string
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

/** 参数调优建议 */
export interface TuningSuggestion {
  parameter: string
  currentValue: number
  suggestedValue: number
  reason: string
  confidence: 'high' | 'medium' | 'low'
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

// ==================== Wave 2-4: 盘后/盘中/数据采集 ====================

/** 盘中监控状态 */
export type IntradayMonitorState = 'idle' | 'running' | 'paused'

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

/** 盘中监控运行时状态 */
export interface IntradayMonitorStatus {
  state: IntradayMonitorState
  lastPollAt: string | null
  pollCount: number
  alerts: IntradayAlert[]
  startedAt: string | null
}

/** 数据采集代理运行结果 */
export interface DataAgentResult {
  agentId: string
  collectedAt: string
  dataPointCount: number
  successRate: number
  elapsedMs: number
  errors: string[]
}

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

// ==================== 数据采集 Agent 配置 ====================

export type DataAgentId =
  | 'macro_economy'
  | 'policy_regulation'
  | 'company_info'
  | 'price_volume'
  | 'industry_news'
  | 'social_sentiment'
  | 'global_markets'
  | 'data_quality'

export interface DataAgentConfigItem {
  agentId: DataAgentId
  enabled: boolean
  timeoutMs: number
  priority: number
  label: string
}

export interface DataAgentConfigStore {
  version: number
  updatedAt: string
  agents: DataAgentConfigItem[]
}

// ==================== AI 专家分析 & 数据收集页面 ====================

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

/** 单日专家记忆条目 */
export interface ExpertDailyMemoryEntry {
  tradeDate: string
  expertId: string
  code: string
  name: string
  verdict: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  reason: string
  actualReturnNextDay: number | null
  wasCorrect: boolean | null
}

/** 专家完整记忆 */
export interface ExpertMemory {
  expertId: string
  shortTerm: { entries: ExpertDailyMemoryEntry[] }
  midTerm: {
    summary: string
    period: { from: string; to: string }
    winRate: number
    avgConfidence: number
    dominantVerdict: 'bullish' | 'bearish' | 'neutral'
    keyPatterns: string[]
    compressedAt: string
  } | null
  longTerm: {
    lessons: string[]
    strengths: string[]
    weaknesses: string[]
    updatedAt: string
  } | null
  updatedAt: string
}

/** AI 专家分析 API 响应 */
export interface ExpertAnalysisResponse {
  tradeDate: string
  analyzedAt: string | null
  signalCount: number
  signals: Array<{
    id: string
    code: string
    name: string
    action: SignalAction
    compositeScore: number
    expert: {
      bullishCount: number
      bearishCount: number
      neutralCount: number
      consensus: number
      score: number
      highlights: string[]
      risks: string[]
      votes?: StockAnalysisExpertVote[]
      llmSuccessCount?: number
      llmFallbackCount?: number
      ruleFallbackCount?: number
      fallbackCount?: number
      isSimulated?: boolean
    }
    confidence: number
    decisionSource: string
    vetoReasons: string[]
    watchReasons: string[]
  }>
  expertMemories: Record<string, ExpertMemory>
  expertMemoriesUpdatedAt: string
  dailyMemories: ExpertDailyMemoryEntry[]
}

/** AI 数据收集 API 响应 */
export interface DataCollectionResponse {
  tradeDate: string
  factPool: FactPool | null
  llmExtraction: LLMExtractionResult | null
}

// ==================== Phase 12: 自选股票 (Watchlist) ====================

/** 自选股票条目 */
export interface UserWatchlistItem {
  code: string
  name: string
  market: 'sh' | 'sz' | 'bj'
  exchange: string
  industryName: string | null
  note: string
  addedAt: string
}

/** K 线数据点 */
export interface KlinePoint {
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

/** 自选股票实时行情快照 */
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
  volume: number
  klineHistory: KlinePoint[]
}

/** 自选股票完整响应 */
export interface WatchlistResponse {
  items: UserWatchlistItem[]
  quotes: Record<string, WatchlistQuoteSnapshot>
  updatedAt: string
}

/** 股票搜索结果条目 */
export interface StockSearchResult {
  code: string
  name: string
  market: 'sh' | 'sz' | 'bj'
  exchange: string
  industryName?: string | null
}
