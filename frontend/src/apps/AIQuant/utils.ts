import type {
  MarketLiquidity,
  MarketRegime,
  MarketSentiment,
  MarketStyle,
  MarketTrend,
  MarketVolatility,
  PositionAction,
  SignalAction,
  StockAnalysisDataState,
  StockAnalysisRiskEventType,
  StockAnalysisRunState,
} from './types'

export function trendLabel(trend: MarketTrend) {
  switch (trend) {
    case 'bull_trend': return '牛市趋势'
    case 'bear_trend': return '熊市趋势'
    case 'range_bound': return '震荡市'
  }
}

export function volatilityLabel(volatility: MarketVolatility) {
  switch (volatility) {
    case 'high_volatility': return '高波动'
    case 'normal_volatility': return '正常波动'
    case 'low_volatility': return '低波动'
  }
}

export function liquidityLabel(liquidity: MarketLiquidity) {
  switch (liquidity) {
    case 'high_liquidity': return '高流动性'
    case 'normal_liquidity': return '正常流动性'
    case 'low_liquidity': return '低流动性'
  }
}

export function sentimentLabel(sentiment: MarketSentiment) {
  switch (sentiment) {
    case 'optimistic': return '偏乐观'
    case 'neutral': return '中性'
    case 'pessimistic': return '偏悲观'
  }
}

export function styleLabel(style: MarketStyle) {
  switch (style) {
    case 'large_cap': return '大盘风格'
    case 'small_cap': return '小盘风格'
    case 'balanced': return '风格均衡'
  }
}

export function marketRegimeLabel(regime: MarketRegime) {
  switch (regime) {
    case 'bull_trend': return '牛市趋势'
    case 'bear_trend': return '熊市趋势'
    case 'high_volatility': return '高波动市'
    case 'low_volatility_range': return '低波动震荡'
    case 'normal_range': return '常规震荡'
  }
}

export function percentTone(value: number) {
  if (value > 0) return 'text-red-600'
  if (value < 0) return 'text-green-600'
  return 'text-slate-700'
}

export function formatPercent(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

/** 安全格式化价格，兼容旧数据中可能缺失的字段 */
export function formatPrice(value: number | undefined | null): string {
  return value != null ? value.toFixed(2) : '--'
}

export function signalBadge(signal: SignalAction) {
  switch (signal) {
    case 'strong_buy': return 'bg-red-100 text-red-700'
    case 'buy': return 'bg-indigo-100 text-indigo-700'
    case 'watch': return 'bg-amber-100 text-amber-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

export function signalLabel(signal: SignalAction) {
  switch (signal) {
    case 'strong_buy': return '强烈买入'
    case 'buy': return '买入'
    case 'watch': return '观望'
    case 'sell': return '卖出'
    case 'hold': return '持有'
    case 'none': return '无操作'
  }
}

export function positionBadge(action: PositionAction) {
  switch (action) {
    case 'stop_loss': return 'bg-red-100 text-red-700'
    case 'take_profit': return 'bg-indigo-100 text-indigo-700'
    case 'reduce': return 'bg-amber-100 text-amber-700'
    case 'review': return 'bg-slate-100 text-slate-700'
    default: return 'bg-green-100 text-green-700'
  }
}

export function positionLabel(action: PositionAction) {
  switch (action) {
    case 'stop_loss': return '止损'
    case 'take_profit': return '止盈'
    case 'reduce': return '减仓'
    case 'review': return '到期复核'
    case 'swap': return '换仓'
    default: return '继续持有'
  }
}

export function dataStateLabel(state: StockAnalysisDataState) {
  switch (state) {
    case 'ready': return '数据正常'
    case 'stale': return '使用回退数据'
    case 'empty': return '暂无可用快照'
  }
}

export function runStateLabel(state: StockAnalysisRunState) {
  switch (state) {
    case 'idle': return '空闲'
    case 'running': return '运行中'
    case 'success': return '最近运行成功'
    case 'failed': return '最近运行失败'
  }
}

export function riskEventTypeLabel(eventType: StockAnalysisRiskEventType): string {
  switch (eventType) {
    case 'daily_loss_breached': return '日内亏损触发'
    case 'weekly_loss_breached': return '周度亏损触发'
    case 'monthly_loss_breached': return '月度亏损触发'
    case 'max_drawdown_breached': return '最大回撤触发'
    case 'pause_triggered': return '暂停交易'
    case 'trailing_stop_triggered': return '移动止损触发'
    case 'veto_max_positions': return '否决: 仓位已满'
    case 'veto_blacklist': return '否决: 黑名单'
    case 'veto_paused': return '否决: 已暂停'
  }
}

export function riskEventTypeBadge(eventType: StockAnalysisRiskEventType): string {
  switch (eventType) {
    case 'daily_loss_breached':
    case 'weekly_loss_breached':
    case 'monthly_loss_breached':
    case 'max_drawdown_breached':
    case 'pause_triggered':
      return 'bg-red-100 text-red-700'
    case 'trailing_stop_triggered':
      return 'bg-amber-100 text-amber-700'
    case 'veto_max_positions':
    case 'veto_blacklist':
    case 'veto_paused':
      return 'bg-slate-100 text-slate-700'
  }
}

/** 决策来源的中文标签 + 样式（根据信号动作区分"确认买入"和"确认观望"） */
export function decisionSourceLabel(source: string, signalAction?: string): { label: string; badge: string } {
  switch (source) {
    case 'user_confirmed': {
      const isWatch = signalAction === 'watch' || signalAction === 'none'
      return isWatch
        ? { label: '已确认观望', badge: 'bg-blue-100 text-blue-700' }
        : { label: '已确认买入', badge: 'bg-green-100 text-green-700' }
    }
    case 'user_override': return { label: '已主动买入', badge: 'bg-green-100 text-green-700' }
    case 'user_rejected': return { label: '已放弃', badge: 'bg-amber-100 text-amber-700' }
    case 'user_ignored': return { label: '已忽略', badge: 'bg-slate-100 text-slate-600' }
    default: return { label: '待处理', badge: 'bg-blue-100 text-blue-700' }
  }
}

export function isTPlusOneBlocked(openedAt: string, now: Date = new Date()) {
  return openedAt.slice(0, 10) === now.toISOString().slice(0, 10)
}

export function getHoldingDaysFromOpenedAt(openedAt: string, now: Date = new Date()) {
  const openedAtMs = new Date(openedAt).getTime()
  const diffMs = now.getTime() - openedAtMs
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1)
}
