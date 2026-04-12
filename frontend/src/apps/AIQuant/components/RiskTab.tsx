import type {
  StockAnalysisOverview,
  StockAnalysisPosition,
  StockAnalysisPortfolioRiskLimits,
  StockAnalysisRiskControlState,
  StockAnalysisRiskEvent,
  MarketLevelRiskState,
} from '../types'
import {
  formatPercent,
  getHoldingDaysFromOpenedAt,
  isTPlusOneBlocked,
  percentTone,
  positionBadge,
  positionLabel,
  riskEventTypeBadge,
  riskEventTypeLabel,
  sentimentLabel,
  volatilityLabel,
} from '../utils'

/* ---------- 默认阈值（当 riskLimits 未提供时使用） ---------- */
const DEFAULT_LIMITS: StockAnalysisPortfolioRiskLimits = {
  maxDailyLossPercent: 3,
  maxWeeklyLossPercent: 6,
  maxMonthlyLossPercent: 10,
  maxDrawdownPercent: 15,
}

/* ---------- 子组件 ---------- */

function RiskIndicator({ label, value, limit, breached }: { label: string; value: number; limit: number; breached: boolean }) {
  const ratio = Math.min(Math.abs(value) / limit, 1)
  const barColor = breached ? 'bg-red-500' : ratio > 0.7 ? 'bg-amber-400' : 'bg-green-400'
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className={breached ? 'text-red-600 font-bold' : 'text-slate-500'}>
          {formatPercent(value)} / -{limit}%
        </span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

/** 市场级风控面板 — 极端熊市/极端波动/流动性危机 */
function MarketLevelRiskPanel({ risk }: { risk: MarketLevelRiskState | null | undefined }) {
  if (!risk) return null

  const anyActive = risk.extremeBearActive || risk.extremeVolatilityActive || risk.liquidityCrisisActive
  const borderColor = anyActive ? 'border-red-300 bg-red-50/30' : 'border-green-200 bg-green-50/20'
  const headerDot = anyActive ? 'bg-red-500' : 'bg-green-500'
  const headerBadge = anyActive
    ? 'bg-red-100 text-red-700'
    : 'bg-green-100 text-green-700'

  const items: Array<{ label: string; description: string; active: boolean }> = [
    {
      label: '极端熊市',
      description: risk.extremeBearActive ? '20日跌幅>10%，暂停新开仓' : '20日跌幅正常',
      active: risk.extremeBearActive,
    },
    {
      label: '极端波动',
      description: risk.extremeVolatilityActive ? '波动率>95th，仓位上限降至50%' : '波动率在正常区间',
      active: risk.extremeVolatilityActive,
    },
    {
      label: '流动性危机',
      description: risk.liquidityCrisisActive ? '成交量<10th，仅允许卖出' : '成交量正常',
      active: risk.liquidityCrisisActive,
    },
  ]

  return (
    <div className={`border rounded-2xl overflow-hidden shadow-sm ${borderColor}`}>
      <div className="px-4 py-3 border-b border-slate-100/60 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${headerDot}`} />
          <h3 className="font-semibold text-slate-700 text-sm">市场级风控</h3>
        </div>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${headerBadge}`}>
          {anyActive ? '触发限制' : '正常'}
        </span>
      </div>
      <div className="p-3 space-y-2.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.active ? 'bg-red-500' : 'bg-green-500'}`} />
            <div className="flex-1 min-w-0 flex items-center justify-between">
              <span className="text-sm text-slate-700">{item.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${item.active ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {item.description}
              </span>
            </div>
          </div>
        ))}
        <div className="pt-1 border-t border-slate-100 mt-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>有效仓位上限</span>
            <span className="font-medium text-slate-700">{Math.round(risk.effectiveMaxPositionRatio * 100)}%</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
            <span>允许开仓</span>
            <span className={`font-medium ${risk.newPositionsAllowed ? 'text-green-700' : 'text-red-700'}`}>{risk.newPositionsAllowed ? '是' : '否'}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
            <span>允许买入</span>
            <span className={`font-medium ${risk.buyAllowed ? 'text-green-700' : 'text-red-700'}`}>{risk.buyAllowed ? '是' : '否'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 事前风控面板 — 否决条件状态 */
function PreTradePanel({ overview }: { overview: StockAnalysisOverview }) {
  const riskControl = overview.systemStatus.riskControl
  const maxPositions = overview.stats.maxPositions ?? 3
  const currentPositions = overview.positions.length
  const isFull = currentPositions >= maxPositions
  const isPaused = riskControl?.paused ?? false

  const items: Array<{ label: string; ok: boolean; detail: string }> = [
    {
      label: '仓位限制',
      ok: !isFull,
      detail: isFull ? `持仓已满 (${currentPositions}/${maxPositions})` : `${currentPositions}/${maxPositions}`,
    },
    {
      label: '交易暂停',
      ok: !isPaused,
      detail: isPaused ? `已暂停` : '未暂停',
    },
    {
      label: '风控阈值',
      ok: !(riskControl?.dailyLossBreached || riskControl?.weeklyLossBreached || riskControl?.monthlyLossBreached || riskControl?.maxDrawdownBreached),
      detail: riskControl?.dailyLossBreached ? '日内亏损超限' : riskControl?.weeklyLossBreached ? '周度超限' : riskControl?.monthlyLossBreached ? '月度超限' : riskControl?.maxDrawdownBreached ? '回撤超限' : '正常',
    },
  ]

  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <h3 className="font-semibold text-slate-700 text-sm">事前风控 — 否决条件</h3>
      </div>
      <div className="p-3 space-y-2.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.ok ? 'bg-green-500' : 'bg-red-500'}`} />
            <div className="flex-1 min-w-0 flex items-center justify-between">
              <span className="text-sm text-slate-700">{item.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${item.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {item.detail}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 系统级风控面板 — 日/周/月亏损与阈值距离 */
function SystemRiskPanel({ riskControl, limits }: { riskControl: StockAnalysisRiskControlState | undefined; limits: StockAnalysisPortfolioRiskLimits }) {
  const rc = riskControl ?? {
    paused: false, pauseReason: null, pausedAt: null,
    dailyLossPercent: 0, weeklyLossPercent: 0, monthlyLossPercent: 0, maxDrawdownPercent: 0,
    dailyLossBreached: false, weeklyLossBreached: false, monthlyLossBreached: false, maxDrawdownBreached: false,
    lastCheckedAt: null,
  }

  const anyBreached = rc.dailyLossBreached || rc.weeklyLossBreached || rc.monthlyLossBreached || rc.maxDrawdownBreached
  const statusColor = rc.paused ? 'border-red-300 bg-red-50/50' : anyBreached ? 'border-amber-300 bg-amber-50/50' : 'border-green-200 bg-green-50/30'
  const statusText = rc.paused ? '已暂停' : anyBreached ? '部分触发' : '正常'
  const statusDot = rc.paused ? 'bg-red-500' : anyBreached ? 'bg-amber-500' : 'bg-green-500'

  return (
    <div className={`border rounded-2xl overflow-hidden shadow-sm ${statusColor}`}>
      <div className="px-4 py-3 border-b border-slate-100/60 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />
          <h3 className="font-semibold text-slate-700 text-sm">系统级风控 — 组合阈值</h3>
        </div>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${rc.paused ? 'bg-red-100 text-red-700' : anyBreached ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
          {statusText}
        </span>
      </div>
      <div className="p-3 space-y-2.5">
        {rc.paused ? (
          <div className="bg-red-100 text-red-700 text-xs p-2.5 rounded-lg">
            <p className="font-bold">交易已暂停</p>
            <p className="mt-0.5">{rc.pauseReason}</p>
          </div>
        ) : null}
        <RiskIndicator label="日内亏损" value={rc.dailyLossPercent} limit={limits.maxDailyLossPercent} breached={rc.dailyLossBreached} />
        <RiskIndicator label="周度亏损" value={rc.weeklyLossPercent} limit={limits.maxWeeklyLossPercent} breached={rc.weeklyLossBreached} />
        <RiskIndicator label="月度亏损" value={rc.monthlyLossPercent} limit={limits.maxMonthlyLossPercent} breached={rc.monthlyLossBreached} />
        <RiskIndicator label="最大回撤" value={-rc.maxDrawdownPercent} limit={limits.maxDrawdownPercent} breached={rc.maxDrawdownBreached} />
      </div>
    </div>
  )
}

/** 事中风控面板 — 个股持仓监控（含移动止损） */
function InTradePanel({ overview, onClosePosition, onReducePosition, actionLoading, tradingStatus }: { overview: StockAnalysisOverview; onClosePosition: (position: StockAnalysisPosition) => void; onReducePosition: (position: StockAnalysisPosition, quantity: number) => void; actionLoading: boolean; tradingStatus: { canTrade: boolean; reason: string | null } }) {
  const evaluations = overview.positionEvaluations ?? []
  const evalMap = new Map(evaluations.map((ev) => [ev.positionId, ev]))

  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
        <h3 className="font-semibold text-slate-700 text-sm">事中风控 — 个股持仓监控</h3>
        <span className="text-xs text-slate-500">持股: {overview.positions.length}/3</span>
      </div>
      {overview.positions.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-slate-400">当前无持仓</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {overview.positions.map((position) => {
            const evaluation = evalMap.get(position.id)
            const tPlusOneBlocked = isTPlusOneBlocked(position.openedAt)
            const effectiveHoldingDays = getHoldingDaysFromOpenedAt(position.openedAt)
            const tradeBlockedReason = tPlusOneBlocked
              ? 'A股 T+1：今日买入，需下个交易日才能卖出'
              : (!tradingStatus.canTrade ? tradingStatus.reason ?? '非交易时间' : '')
            return (
              <div key={position.id} className="px-4 py-3">
                {/* 头部：股票名称 + 盈亏 + 操作 */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 text-sm">{position.name}</span>
                    <span className="text-slate-400 text-xs">{position.code}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${positionBadge(position.action)}`}>
                      {positionLabel(position.action)}
                    </span>
                  </div>
                   <div className="flex items-center gap-2">
                    <span className={`text-base font-bold ${percentTone(position.returnPercent)}`}>
                      {formatPercent(position.returnPercent)}
                    </span>
                    {position.quantity > 100 ? (
                      <button
                        disabled={actionLoading || !tradingStatus.canTrade || tPlusOneBlocked}
                        title={tradeBlockedReason}
                        onClick={() => onReducePosition(position, Math.floor(position.quantity / 2 / 100) * 100)}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        减半
                      </button>
                    ) : null}
                    <button
                      disabled={actionLoading || !tradingStatus.canTrade || tPlusOneBlocked}
                      title={tradeBlockedReason}
                      onClick={() => onClosePosition(position)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      平仓
                    </button>
                  </div>
                </div>

                {/* 持仓详情 + 止损止盈 一行 */}
                <div className="mt-2 flex items-center gap-4 text-xs flex-wrap">
                  <span className="text-slate-500">持有 {effectiveHoldingDays} 天</span>
                  <span className="text-slate-500">买入 {new Date(position.openedAt).toLocaleString('zh-CN')}</span>
                  <span className="text-slate-500">成本 {position.costPrice.toFixed(2)}</span>
                  <span className="text-slate-500">现价 {position.currentPrice.toFixed(2)}</span>
                  <span className="text-slate-500">仓位 {(position.weight * 100).toFixed(0)}%</span>
                  <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                    止盈 {position.takeProfitPrice1.toFixed(2)}/{position.takeProfitPrice2.toFixed(2)}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                    止损 {position.stopLossPrice.toFixed(2)}
                  </span>
                  {position.trailingStopEnabled ? (
                    <span className={`px-1.5 py-0.5 rounded border ${position.returnPercent >= 3 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      移动止损 {position.returnPercent >= 3 ? `已激活` : '待激活'}
                    </span>
                  ) : null}
                  {tPlusOneBlocked ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      T+1 限制中，今日不可卖出
                    </span>
                  ) : null}
                </div>

                {/* 实时评分变化（如有） */}
                {evaluation ? (
                  <div className="mt-2 bg-slate-50/70 rounded-lg p-2.5 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">买入基础 <span className="font-medium text-slate-700">{evaluation.buyCompositeScore}</span></span>
                      <span className="text-slate-500">当前基础 <span className={`font-medium ${evaluation.scoreDelta < -10 ? 'text-red-600' : 'text-slate-700'}`}>{evaluation.currentCompositeScore}</span></span>
                      <span className="text-slate-500">基础分差 <span className={`font-medium ${evaluation.scoreDelta < 0 ? 'text-red-600' : 'text-green-600'}`}>{evaluation.scoreDelta > 0 ? '+' : ''}{evaluation.scoreDelta}</span></span>
                      <span className="text-slate-500">当前最终 <span className="font-medium text-slate-700">{evaluation.currentFinalScore}</span></span>
                      <span className="text-slate-500">专家共识 <span className="font-medium text-slate-700">{evaluation.expertConsensus.toFixed(2)}</span></span>
                      {evaluation.sellRecommended ? (
                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold ml-auto">{evaluation.sellReasonText}</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 ml-auto">正常</span>
                      )}
                    </div>
                  </div>
                ) : null}

                {position.actionReason ? (
                  <p className="mt-1.5 text-xs text-slate-500">{position.actionReason}</p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** 事后风控面板 — 复盘摘要 */
function PostTradePanel({ overview }: { overview: StockAnalysisOverview }) {
  const reviews = overview.recentReviews ?? []
  if (reviews.length === 0) return null

  const wins = reviews.filter((r) => r.pnlPercent > 0).length
  const losses = reviews.filter((r) => r.pnlPercent < 0).length
  const avgPnl = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.pnlPercent, 0) / reviews.length : 0

  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
        <h3 className="font-semibold text-slate-700 text-sm">事后风控 — 交易复盘</h3>
        <div className="flex gap-2 text-xs text-slate-500">
          <span>盈 <span className="text-red-600 font-bold">{wins}</span></span>
          <span>亏 <span className="text-green-600 font-bold">{losses}</span></span>
          <span>均 <span className={`font-bold ${percentTone(avgPnl)}`}>{formatPercent(avgPnl)}</span></span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {reviews.slice(0, 5).map((review) => (
          <div key={review.id} className="px-4 py-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800 text-sm">{review.name}</span>
                <span className="text-slate-400 text-xs">{review.code}</span>
              </div>
              <span className={`text-sm font-bold ${review.pnlPercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatPercent(review.pnlPercent)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
              <span>{review.holdingDays}天</span>
              <span>买 {review.buyPrice.toFixed(2)}</span>
              <span>卖 {review.sellPrice.toFixed(2)}</span>
              <span>综合分 {review.buyCompositeScore}</span>
              {review.buyMarketRegime ? <span>{review.buyMarketRegime}</span> : null}
              <span>{review.sellReason}</span>
            </div>
            {review.lessonsLearned.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {review.lessonsLearned.map((lesson, index) => (
                  <span key={index} className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{lesson}</span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 风控事件时间线 */
function RiskEventTimeline({ events }: { events: StockAnalysisRiskEvent[] }) {
  if (events.length === 0) return null

  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
        <h3 className="font-semibold text-slate-700 text-sm">风控事件时间线</h3>
        <span className="text-xs text-slate-500">最近 {events.length} 条</span>
      </div>
      <div className="p-3">
        <div className="relative">
          <div className="absolute left-2.5 top-2 bottom-2 w-px bg-slate-200" />
          <div className="space-y-2.5">
            {events.map((event) => (
              <div key={event.id} className="relative pl-7">
                <div className={`absolute left-1 top-1.5 w-3 h-3 rounded-full border-2 border-white ${
                  event.eventType.includes('breached') || event.eventType === 'pause_triggered' ? 'bg-red-500' :
                  event.eventType === 'trailing_stop_triggered' ? 'bg-amber-500' : 'bg-slate-400'
                }`} />
                <div className="bg-slate-50/70 rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${riskEventTypeBadge(event.eventType)}`}>
                        {riskEventTypeLabel(event.eventType)}
                      </span>
                      {event.relatedCode ? (
                        <span className="text-xs text-slate-500 truncate">{event.relatedCode}</span>
                      ) : null}
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {new Date(event.timestamp).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{event.reason}</p>
                  {(event.metrics.dailyLossPercent !== undefined || event.metrics.weeklyLossPercent !== undefined || event.metrics.monthlyLossPercent !== undefined || event.metrics.maxDrawdownPercent !== undefined) ? (
                    <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-slate-500">
                      {event.metrics.dailyLossPercent !== undefined ? <span>日: {formatPercent(event.metrics.dailyLossPercent)}</span> : null}
                      {event.metrics.weeklyLossPercent !== undefined ? <span>周: {formatPercent(event.metrics.weeklyLossPercent)}</span> : null}
                      {event.metrics.monthlyLossPercent !== undefined ? <span>月: {formatPercent(event.metrics.monthlyLossPercent)}</span> : null}
                      {event.metrics.maxDrawdownPercent !== undefined ? <span>回撤: {formatPercent(-event.metrics.maxDrawdownPercent)}</span> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- 主组件 ---------- */

export function RiskTab({ overview, onClosePosition, onReducePosition, actionLoading, tradingStatus }: { overview: StockAnalysisOverview; onClosePosition: (position: StockAnalysisPosition) => void; onReducePosition: (position: StockAnalysisPosition, quantity: number) => void; actionLoading: boolean; tradingStatus: { canTrade: boolean; reason: string | null } }) {
  const totalPosition = overview.positions.reduce((sum, position) => sum + position.weight, 0)
  const riskControl = overview.systemStatus.riskControl
  const limits = overview.riskLimits ?? DEFAULT_LIMITS
  const riskEvents = overview.riskEvents ?? []

  const pauseSuggestion = riskControl?.paused
    ? `已暂停: ${riskControl.pauseReason ?? '请检查风控状态'}`
    : overview.stats.maxDrawdown <= -10
      ? '接近月度阈值，建议防守或清仓。'
      : overview.marketState.trend === 'bear_trend'
        ? '熊市趋势，建议控制仓位。'
        : '允许精选开仓，遵守仓位上限。'

  return (
    <div className="space-y-3 pb-20">
      <h2 className="text-xl font-bold text-slate-800">四层风控面板</h2>

      {/* 市场级风控 + 事前风控 + 系统级风控 + 仓位摘要 四列 */}
      <div className="grid grid-cols-4 gap-3">
        <MarketLevelRiskPanel risk={overview.marketLevelRisk} />
        <PreTradePanel overview={overview} />
        <SystemRiskPanel riskControl={riskControl} limits={limits} />

        {/* 仓位 + 回撤 + 建议 竖排摘要卡 */}
        <div className="bg-white/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <h3 className="font-semibold text-slate-700 text-sm">组合概况</h3>
          </div>
          <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
            <div className="space-y-2">
              <div>
                <span className="text-xs text-slate-500">仓位占用</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-bold text-slate-800 text-lg">{Math.round(totalPosition * 100)}%</span>
                  <span className="text-xs text-slate-400">/ {Math.round((overview.marketLevelRisk?.effectiveMaxPositionRatio ?? 0.85) * 100)}%</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-500">最大回撤</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-bold text-slate-800 text-lg">{formatPercent(overview.stats.maxDrawdown)}</span>
                  <span className="text-xs text-slate-400">/ -{limits.maxDrawdownPercent}%</span>
                </div>
              </div>
            </div>
            <div className="space-y-1 text-xs text-slate-500">
              <div className="flex gap-2">
                <span>波动: {volatilityLabel(overview.marketState.volatility)}</span>
                <span>情绪: {sentimentLabel(overview.marketState.sentiment)}</span>
              </div>
              <p className="text-slate-600 text-xs leading-relaxed">{pauseSuggestion}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 事中风控 + 事后风控 左右各50% */}
      <div className="grid grid-cols-2 gap-3">
        <InTradePanel overview={overview} onClosePosition={onClosePosition} onReducePosition={onReducePosition} actionLoading={actionLoading} tradingStatus={tradingStatus} />
        <PostTradePanel overview={overview} />
      </div>

      {/* 风控事件时间线 */}
      <RiskEventTimeline events={riskEvents} />
    </div>
  )
}
