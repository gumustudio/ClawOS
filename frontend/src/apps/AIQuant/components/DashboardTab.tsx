import { useCallback, useEffect, useState } from 'react'

import { acknowledgeAllIntradayAlerts, acknowledgeIntradayAlert, acknowledgeNotification, fetchIntradayAlerts } from '../api'
import type { AutoReportNotification, IntradayAlert, StockAnalysisOverview } from '../types'
import {
  buildConvictionStats,
  buildDailyAdviceSummary,
} from '../dashboardMeta'
import {
  formatPercent,
  liquidityLabel,
  percentTone,
  sentimentLabel,
  signalBadge,
  signalLabel,
  styleLabel,
  trendLabel,
  volatilityLabel,
} from '../utils'
import {
  AdviceSection,
  InfoRow,
  MetricCard,
} from './shared'

function NotificationBanner({ notifications, onAcknowledge }: { notifications: AutoReportNotification[]; onAcknowledge: (id: string) => void }) {
  if (notifications.length === 0) return null

  return (
    <div className="space-y-2">
      {notifications.slice(0, 3).map((n) => (
        <div
          key={n.id}
          className={`rounded-xl border px-4 py-3 text-sm ${
            n.type === 'monthly_report'
              ? 'border-purple-200 bg-purple-50/70'
              : 'border-blue-200 bg-blue-50/70'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                  n.type === 'monthly_report'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {n.type === 'monthly_report' ? '月报' : '周报'}
                </span>
                <span className="font-semibold text-slate-800">{n.title}</span>
                <span className="text-xs text-slate-400">{new Date(n.generatedAt).toLocaleString('zh-CN')}</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-xs">{n.summary}</p>
            </div>
            <button
              onClick={() => onAcknowledge(n.id)}
              className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50"
            >
              已读
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  stop_loss: '止损',
  take_profit_1: '止盈1',
  take_profit_2: '止盈2',
  trailing_stop: '追踪止损',
  daily_loss_limit: '日亏限额',
  max_hold_days: '超期持仓',
}

function IntradayAlertBanner({ alerts, onAcknowledge, onAcknowledgeAll }: { alerts: IntradayAlert[]; onAcknowledge: (id: string) => void; onAcknowledgeAll: () => void }) {
  const unacked = alerts.filter((a) => !a.acknowledged)
  if (unacked.length === 0) return null

  return (
    <div className="space-y-2">
      {unacked.length > 1 ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-red-600 font-medium">{unacked.length} 条未读告警</span>
          <button
            onClick={onAcknowledgeAll}
            className="px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 text-xs text-red-600 font-medium hover:bg-red-100"
          >
            全部已读
          </button>
        </div>
      ) : null}
      {unacked.slice(0, 5).map((alert) => (
        <div
          key={alert.id}
          className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                  {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
                </span>
                <span className="font-semibold text-slate-800">{alert.name} ({alert.code})</span>
                <span className="text-xs text-slate-400">{new Date(alert.timestamp).toLocaleString('zh-CN')}</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-xs">{alert.message}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                当前价 <span className="font-bold">{alert.currentPrice.toFixed(2)}</span>
                {' / '}触发价 <span className="font-bold">{alert.triggerPrice.toFixed(2)}</span>
              </p>
            </div>
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50"
            >
              已读
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function IntradayMonitorBadge({ overview }: { overview: StockAnalysisOverview }) {
  const monitor = overview.systemStatus.intradayMonitor
  if (!monitor) return null

  const stateLabels: Record<string, string> = { idle: '待机', running: '运行中', paused: '已暂停' }
  const stateColors: Record<string, string> = {
    idle: 'bg-slate-100 text-slate-600 border-slate-200',
    running: 'bg-green-50 text-green-700 border-green-200',
    paused: 'bg-amber-50 text-amber-700 border-amber-200',
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs ${stateColors[monitor.state] ?? stateColors.idle}`}>
      {monitor.state === 'running' ? <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> : null}
      <span className="font-medium">盘中监控: {stateLabels[monitor.state] ?? monitor.state}</span>
      {monitor.pollCount > 0 ? <span className="text-[10px] opacity-75">轮询{monitor.pollCount}次</span> : null}
      {monitor.activeAlertCount > 0 ? <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">{monitor.activeAlertCount}告警</span> : null}
    </div>
  )
}

export function DashboardTab({ overview, onOverviewUpdate }: { overview: StockAnalysisOverview; onOverviewUpdate?: (overview: StockAnalysisOverview) => void }) {
  const advice = buildDailyAdviceSummary(overview)
  const conviction = buildConvictionStats(overview.topSignals, overview.marketState)
  const [showSystemStatus, setShowSystemStatus] = useState(false)
  const [intradayAlerts, setIntradayAlerts] = useState<IntradayAlert[]>([])

  const notifications = overview.notifications ?? []
  const monitorRunning = overview.systemStatus.intradayMonitor?.state === 'running'

  // 盘中监控运行时，每 30 秒拉取告警
  const loadAlerts = useCallback(async () => {
    try {
      const alerts = await fetchIntradayAlerts()
      setIntradayAlerts(alerts)
    } catch {
      // 静默失败
    }
  }, [])

  useEffect(() => {
    if (!monitorRunning) {
      setIntradayAlerts([])
      return
    }
    void loadAlerts()
    const timer = setInterval(() => void loadAlerts(), 30_000)
    return () => clearInterval(timer)
  }, [monitorRunning, loadAlerts])

  async function handleAcknowledge(id: string) {
    try {
      await acknowledgeNotification(id)
      if (onOverviewUpdate) {
        onOverviewUpdate({
          ...overview,
          notifications: notifications.filter((n) => n.id !== id),
        })
      }
    } catch {
      // 静默失败 — 不影响用户操作
    }
  }

  async function handleAlertAcknowledge(alertId: string) {
    try {
      await acknowledgeIntradayAlert(alertId)
      setIntradayAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, acknowledged: true } : a))
    } catch {
      // 静默失败
    }
  }

  async function handleAlertAcknowledgeAll() {
    try {
      await acknowledgeAllIntradayAlerts()
      setIntradayAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })))
    } catch {
      // 静默失败
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 标题行 */}
      <div className="flex items-center justify-between flex-shrink-0 mb-2">
        <h2 className="text-xl font-bold text-slate-800">总览看板</h2>
        <span className="text-xs text-slate-400">{overview.tradeDate}</span>
      </div>

      {/* 通知 / 告警横幅（有通知时才占空间） */}
      {(notifications.length > 0 || intradayAlerts.filter((a) => !a.acknowledged).length > 0) ? (
        <div className="flex-shrink-0 space-y-2 mb-2">
          <NotificationBanner notifications={notifications} onAcknowledge={(id) => void handleAcknowledge(id)} />
          <IntradayAlertBanner alerts={intradayAlerts} onAcknowledge={(id) => void handleAlertAcknowledge(id)} onAcknowledgeAll={() => void handleAlertAcknowledgeAll()} />
        </div>
      ) : null}

      {/* ======== 三列主网格 — 撑满剩余高度 ======== */}
      <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">

        {/* ── 左列：今日操作建议 ── */}
        <div className="bg-white/70 border border-indigo-100 rounded-2xl p-3 shadow-sm shadow-indigo-50 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-indigo-700 text-sm">今日操作建议</h3>
            <span className="text-xs text-slate-500">持仓：{advice.positionUsageLabel}</span>
          </div>
          <div className="space-y-2">
            <AdviceSection title="卖出信号" tone="red" items={advice.sells} emptyText="当前没有触发风控或主动卖出信号" />
            {advice.swaps.length > 0 ? <AdviceSection title="换仓建议" tone="purple" items={advice.swaps} emptyText="" /> : null}
            <AdviceSection title="买入信号" tone="green" items={advice.buys} emptyText="当前没有通过 Conviction Filter 的买入信号" />
            <AdviceSection title="观望信号" tone="amber" items={advice.watches} emptyText="当前没有重点观望标的" />
          </div>
        </div>

        {/* ── 中列：今日最强信号 ── */}
        <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-3 shadow-sm overflow-y-auto">
          <h3 className="font-semibold text-slate-700 mb-2 text-sm">今日最强信号</h3>
          <div className="space-y-1.5">
            {overview.topSignals.slice(0, 10).map((signal) => (
              <div key={signal.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 text-sm truncate">{signal.name} ({signal.code})</div>
                  <div className="text-xs text-slate-500">{signal.sector} | {signal.finalScore}分</div>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0 ${signalBadge(signal.action)}`}>{signalLabel(signal.action)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 右列：Conviction + 本周追踪 + 统计市场 + 系统状态 ── */}
        <div className="flex flex-col gap-2 overflow-y-auto">

          {/* Conviction Filter */}
          <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-2.5 shadow-sm space-y-1.5">
            <h3 className="font-semibold text-slate-700 text-sm">Conviction Filter</h3>
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-2 py-1.5 text-sm font-semibold text-indigo-700">
              {advice.stats.summaryText || '暂无今日建议'}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <MetricCard label="分析标的" value={`${advice.stats.analyzed} 只`} />
              <MetricCard label="通过筛选" value={`${advice.stats.passed} 只`} />
              <MetricCard label="强买 / 买入" value={`${conviction.strongBuyCount} / ${conviction.buyCount}`} />
              <MetricCard label="平均综合分" value={conviction.avgScore.toFixed(1)} />
            </div>
          </div>

          {/* 本周追踪 */}
          <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-2.5 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-1.5 text-sm">本周追踪</h3>
            <div className="space-y-1">
              {overview.weeklySummary.slice(0, 4).map((item) => (
                <div key={item.weekLabel} className="rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-1 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-800 text-xs">{item.weekLabel}</div>
                    <div className="text-[11px] text-slate-500">{item.tradeCount}笔 | 观望{item.watchDays}天</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold text-sm ${percentTone(item.weeklyReturn)}`}>{formatPercent(item.weeklyReturn)}</div>
                    <div className="text-[11px] text-slate-500">{Math.round(item.winRate * 100)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 统计 + 市场状态 */}
          <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-2.5 shadow-sm space-y-1.5">
            <h3 className="font-semibold text-slate-700 text-sm">统计 & 市场</h3>
            <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-xs">
              <span className="text-slate-500">股票池 <span className="font-bold text-slate-800">{overview.stats.stockPoolSize}</span></span>
              <span className="text-slate-500">候选 <span className="font-bold text-slate-800">{overview.stats.candidatePoolSize}</span></span>
              <span className="text-slate-500">通过 <span className="font-bold text-red-600">{overview.stats.passingSignals}</span></span>
              <span className="text-slate-500">胜率 <span className="font-bold text-red-600">{Math.round(overview.stats.winRate * 100)}%</span></span>
              <span className="text-slate-500">累计 <span className={`font-bold ${percentTone(overview.stats.cumulativeReturn)}`}>{formatPercent(overview.stats.cumulativeReturn)}</span></span>
              <span className="text-slate-500">回撤 <span className={`font-bold ${percentTone(overview.stats.maxDrawdown)}`}>{formatPercent(overview.stats.maxDrawdown)}</span></span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-xs pt-1 border-t border-slate-100">
              <span className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 text-slate-700">{trendLabel(overview.marketState.trend)}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 text-slate-700">{volatilityLabel(overview.marketState.volatility)}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 text-slate-700">{liquidityLabel(overview.marketState.liquidity)}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 text-slate-700">{sentimentLabel(overview.marketState.sentiment)}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 text-slate-700">{styleLabel(overview.marketState.style)}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>20日 <span className={`font-bold ${percentTone(overview.marketState.csi500Return20d)}`}>{formatPercent(overview.marketState.csi500Return20d)}</span></span>
              <span>波动 <span className="font-bold">{overview.marketState.annualizedVolatility20d.toFixed(1)}%</span></span>
              <span>上涨 <span className="font-bold">{Math.round(overview.marketState.risingRatio * 100)}%</span></span>
            </div>
          </div>

          {/* 系统状态 */}
          <div className="bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => setShowSystemStatus(!showSystemStatus)}
              className="w-full px-2.5 py-2 flex items-center justify-between text-sm hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700 text-sm">系统状态</span>
                <IntradayMonitorBadge overview={overview} />
              </div>
              <span className="text-xs text-slate-400">{showSystemStatus ? '收起' : '展开'}</span>
            </button>
            {showSystemStatus ? (
              <div className="px-2.5 pb-2 space-y-1 text-xs text-slate-600 border-t border-slate-100 pt-1.5">
                <InfoRow label="最后运行" value={overview.systemStatus.lastRunAt ? new Date(overview.systemStatus.lastRunAt).toLocaleString('zh-CN') : '未运行'} />
                <InfoRow label="最近成功" value={overview.systemStatus.lastSuccessAt ? new Date(overview.systemStatus.lastSuccessAt).toLocaleString('zh-CN') : '暂无'} />
                <InfoRow label="盘后分析" value={overview.systemStatus.postMarketAt ? new Date(overview.systemStatus.postMarketAt).toLocaleString('zh-CN') : '暂无'} />
                <InfoRow label="股票池刷新" value={overview.systemStatus.stockPoolRefreshedAt ? new Date(overview.systemStatus.stockPoolRefreshedAt).toLocaleString('zh-CN') : '暂无'} />
                {overview.systemStatus.intradayMonitor ? (
                  <InfoRow label="盘中监控" value={
                    overview.systemStatus.intradayMonitor.state === 'running'
                      ? `运行中 (轮询${overview.systemStatus.intradayMonitor.pollCount}次${overview.systemStatus.intradayMonitor.lastPollAt ? `, 最近 ${new Date(overview.systemStatus.intradayMonitor.lastPollAt).toLocaleTimeString('zh-CN')}` : ''})`
                      : overview.systemStatus.intradayMonitor.state === 'paused' ? '已暂停' : '待机'
                  } />
                ) : null}
                <InfoRow label="数据目录" value={overview.stockAnalysisDir} mono />
                {overview.systemStatus.lastError ? <p className="rounded-lg bg-red-50 border border-red-100 p-1.5 text-red-600 text-xs">最近错误: {overview.systemStatus.lastError}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
