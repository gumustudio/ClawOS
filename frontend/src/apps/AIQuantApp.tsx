import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowPathIcon,
  BookOpenIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CircleStackIcon,
  ClockIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  StarIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

import {
  bootstrapStockAnalysis,
  closeStockAnalysisPosition,
  confirmStockAnalysisSignal,
  dismissPositionAction,
  fetchStockAnalysisConfig,
  fetchIntradayAlerts,
  fetchStockAnalysisOverview,
  fetchTradingStatus,
  ignoreStockAnalysisSignal,
  reduceStockAnalysisPosition,
  refreshStockAnalysisStockPool,
  rejectStockAnalysisSignal,
  runStockAnalysisDaily,
  runStockAnalysisPostMarket,
  startIntradayMonitor,
  stopIntradayMonitor,
} from './AIQuant/api'
import { getAutoRefreshIntervalMs, getMsUntilNextMarketBoundary } from './AIQuant/autoRefresh'
import type {
  IntradayAlert,
  StockAnalysisOverview,
  StockAnalysisPortfolioRiskLimits,
  StockAnalysisPosition,
  StockAnalysisSignal,
  StockAnalysisStrategyConfig,
} from './AIQuant/types'
import {
  dataStateLabel,
  positionLabel,
  signalLabel,
  trendLabel,
  volatilityLabel,
} from './AIQuant/utils'
import {
  ErrorState,
  LoadingState,
  StatusBanner,
  TabButton,
} from './AIQuant/components/shared'
import type { Tab } from './AIQuant/components/shared'
import { DashboardTab } from './AIQuant/components/DashboardTab'
import { StrategiesTab } from './AIQuant/components/StrategiesTab'
import { RiskTab } from './AIQuant/components/RiskTab'
import { MemoryTab } from './AIQuant/components/MemoryTab'
import { ProfileTab } from './AIQuant/components/ProfileTab'
import { AIConfigTab } from './AIQuant/components/AIConfigTab'
import { GuideTab } from './AIQuant/components/GuideTab'
import { ExpertAnalysisTab } from './AIQuant/components/ExpertAnalysisTab'
import { DataCollectionTab } from './AIQuant/components/DataCollectionTab'
import { WatchlistTab } from './AIQuant/components/WatchlistTab'
import { createAppNotifier } from './notify'
import { useNotificationStore } from '../store/useNotificationStore'

type ActionMode = 'confirm' | 'reject' | 'ignore' | 'acknowledge' | 'override_buy' | null

// ==================== Toast 通知系统 ====================

interface Toast {
  id: number
  tone: 'success' | 'error' | 'info'
  message: string
}

const TOAST_AUTO_DISMISS_MS = 4000
let nextToastId = 1
const notifyAIQuant = createAppNotifier('aiquant')
const ACTIONABLE_POSITION_ACTIONS = new Set(['stop_loss', 'take_profit', 'reduce', 'review'])

const INTRADAY_ALERT_LABELS: Record<string, string> = {
  stop_loss: '止损',
  take_profit_1: '止盈1',
  take_profit_2: '止盈2',
  trailing_stop: '追踪止损',
  daily_loss_limit: '日亏限额',
  max_hold_days: '超期持仓',
  volatility_spike: '波动异常',
  sector_anomaly: '板块异常',
}

function getIntradayAlertLevel(alertType: IntradayAlert['alertType']): 'info' | 'success' | 'warning' | 'error' {
  switch (alertType) {
    case 'stop_loss':
    case 'daily_loss_limit':
    case 'trailing_stop':
      return 'error'
    case 'take_profit_1':
    case 'take_profit_2':
      return 'success'
    default:
      return 'warning'
  }
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium shadow-lg animate-fade-in ${t.tone === 'success' ? 'bg-green-600' : t.tone === 'error' ? 'bg-red-600' : 'bg-slate-700'}`}
        >
          {t.tone === 'success' ? <CheckCircleIcon className="w-5 h-5 shrink-0" /> : <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />}
          <span className="flex-1 break-words">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="shrink-0 p-0.5 rounded hover:bg-white/20">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

type TradeConfirmState =
  | {
      kind: 'buy'
      title: string
      confirmLabel: string
      riskTone: 'critical' | 'high'
      summary: string
      bullets: string[]
      onConfirm: () => Promise<void>
    }
  | {
      kind: 'close' | 'reduce'
      title: string
      confirmLabel: string
      riskTone: 'critical' | 'high'
      summary: string
      bullets: string[]
      onConfirm: () => Promise<void>
    }

const DEFAULT_LIMITS: StockAnalysisPortfolioRiskLimits = {
  maxDailyLossPercent: 3,
  maxWeeklyLossPercent: 6,
  maxMonthlyLossPercent: 10,
  maxDrawdownPercent: 15,
}

function TradeConfirmDialog({
  state,
  overview,
  tradingStatus,
  actionLoading,
  onCancel,
  onConfirm,
}: {
  state: TradeConfirmState
  overview: StockAnalysisOverview
  tradingStatus: { canTrade: boolean; reason: string | null }
  actionLoading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const riskControl = overview.systemStatus.riskControl
  const limits = overview.riskLimits ?? DEFAULT_LIMITS
  const riskClass = state.riskTone === 'critical'
    ? 'border-red-200 bg-red-50/80'
    : 'border-amber-200 bg-amber-50/80'
  const badgeClass = state.riskTone === 'critical'
    ? 'bg-red-100 text-red-700'
    : 'bg-amber-100 text-amber-700'

  return (
    <div className="absolute inset-0 z-[120] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-white/60 bg-white/90 shadow-2xl backdrop-blur-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200/60 bg-white/70 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${badgeClass}`}>{state.riskTone === 'critical' ? '高危确认' : '重要确认'}</span>
              <span className="text-xs text-slate-400">交易前风险摘要</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800">{state.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{state.summary}</p>
          </div>
          <button onClick={onCancel} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className={`rounded-2xl border p-4 ${riskClass}`}>
            <div className="text-sm font-semibold text-slate-800 mb-2">你即将执行的动作</div>
            <div className="space-y-1 text-sm text-slate-700">
              {state.bullets.map((bullet) => (
                <p key={bullet}>- {bullet}</p>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="text-sm font-semibold text-slate-800 mb-3">组合风控状态</h4>
              <div className="space-y-2 text-sm text-slate-600">
                <p>日内亏损：<span className={riskControl.dailyLossBreached ? 'font-bold text-red-600' : 'font-medium text-slate-800'}>{riskControl.dailyLossPercent.toFixed(2)}% / -{limits.maxDailyLossPercent}%</span></p>
                <p>周度亏损：<span className={riskControl.weeklyLossBreached ? 'font-bold text-red-600' : 'font-medium text-slate-800'}>{riskControl.weeklyLossPercent.toFixed(2)}% / -{limits.maxWeeklyLossPercent}%</span></p>
                <p>最大回撤：<span className={riskControl.maxDrawdownBreached ? 'font-bold text-red-600' : 'font-medium text-slate-800'}>{riskControl.maxDrawdownPercent.toFixed(2)}% / {limits.maxDrawdownPercent}%</span></p>
                <p>交易状态：<span className={tradingStatus.canTrade ? 'font-medium text-green-700' : 'font-bold text-red-600'}>{tradingStatus.canTrade ? '允许执行' : tradingStatus.reason || '当前不可交易'}</span></p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="text-sm font-semibold text-slate-800 mb-3">市场与执行环境</h4>
              <div className="space-y-2 text-sm text-slate-600">
                <p>市场趋势：<span className="font-medium text-slate-800">{trendLabel(overview.marketState.trend)}</span></p>
                <p>波动状态：<span className="font-medium text-slate-800">{volatilityLabel(overview.marketState.volatility)}</span></p>
                <p>数据状态：<span className={overview.systemStatus.dataState === 'ready' ? 'font-medium text-green-700' : 'font-bold text-amber-700'}>{dataStateLabel(overview.systemStatus.dataState)}</span></p>
                <p>建议总仓位：<span className="font-medium text-slate-800">{Math.round(overview.positions.reduce((sum, position) => sum + position.weight, 0) * 100)}%</span></p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200/60 bg-slate-50/70 flex justify-end gap-3">
          <button onClick={onCancel} disabled={actionLoading} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-50">取消</button>
          <button onClick={onConfirm} disabled={actionLoading} className={`px-4 py-2 rounded-xl text-white font-semibold disabled:opacity-50 ${state.riskTone === 'critical' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
            {actionLoading ? '执行中...' : state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AIQuantApp() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [overview, setOverview] = useState<StockAnalysisOverview | null>(null)
  const [config, setConfig] = useState<StockAnalysisStrategyConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSignal, setSelectedSignal] = useState<StockAnalysisSignal | null>(null)
  const [actionMode, setActionMode] = useState<ActionMode>(null)
  const [note, setNote] = useState('')
  const [quantity, setQuantity] = useState(100)
  const [targetWeight, setTargetWeight] = useState(30)
  const [tradingStatus, setTradingStatus] = useState<{ canTrade: boolean; reason: string | null }>({ canTrade: false, reason: '加载中...' })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [tradeConfirmState, setTradeConfirmState] = useState<TradeConfirmState | null>(null)
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null)
  const toastTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const positionAlertSnapshotRef = useRef<Map<string, string>>(new Map())
  const riskControlSnapshotRef = useRef<{ paused: boolean; pauseReason: string | null } | null>(null)
  const dataStateSnapshotRef = useRef<{ dataState: string; staleReasonsKey: string } | null>(null)
  const swapSuggestionSnapshotRef = useRef<string>('')
  const intradayAlertSnapshotRef = useRef<Set<string>>(new Set())
  const runtimeRefreshInFlightRef = useRef(false)
  const actionLoadingRef = useRef(false)

  const safeNotify = useCallback(async (
    title: string,
    message: string,
    level: 'info' | 'success' | 'warning' | 'error' = 'info',
    options?: {
      dedupeKey?: string
      batchKey?: string
      batchTitle?: string
      batchMessageBuilder?: (count: number, latestMessage: string) => string
      riskPriority?: 'critical' | 'high' | 'medium'
      category?: string
      metadata?: Record<string, unknown>
    },
  ) => {
    try {
      await notifyAIQuant({
        title,
        message,
        level,
        metadata: {
          riskPriority: options?.riskPriority || (level === 'error' ? 'high' : level === 'warning' ? 'medium' : 'medium'),
          category: options?.category || 'general',
          ...(options?.metadata || {}),
        },
        dedupeKey: options?.dedupeKey,
        batchKey: options?.batchKey,
        batchTitle: options?.batchTitle,
        batchMessageBuilder: options?.batchMessageBuilder,
      })
    } catch {
      // 系统通知失败不影响炒股主流程
    }
  }, [])
  const notifications = useNotificationStore((state) => state.notifications)
  const removeNotification = useNotificationStore((state) => state.removeNotification)
  const aiRiskNotifications = useMemo(
    () => notifications
      .filter((item) => item.appId === 'aiquant')
      .filter((item) => {
        const category = typeof item.metadata.category === 'string' ? item.metadata.category : ''
        const riskPriority = typeof item.metadata.riskPriority === 'string' ? item.metadata.riskPriority : ''
        return category !== 'general' || riskPriority !== ''
      })
      .slice(0, 8),
    [notifications],
  )

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = toastTimers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      toastTimers.current.delete(id)
    }
  }, [])

  const showToast = useCallback((tone: Toast['tone'], message: string) => {
    const id = nextToastId++
    setToasts((prev) => [...prev.slice(-4), { id, tone, message }]) // 最多保留5条
    const timer = setTimeout(() => dismissToast(id), TOAST_AUTO_DISMISS_MS)
    toastTimers.current.set(id, timer)
  }, [dismissToast])

  const applyRuntimeState = useCallback((data: StockAnalysisOverview, tradingData: { canTrade: boolean; reason: string | null }) => {
    setOverview(data)
    setTradingStatus(tradingData)
    setLastRefreshAt(new Date().toISOString())
    setSelectedSignal((current) => data.topSignals.find((item) => item.id === current?.id) ?? data.topSignals[0] ?? null)
  }, [])

  const loadOverview = useCallback(async () => {
    setError(null)
    const [data, configData, tradingData] = await Promise.all([
      fetchStockAnalysisOverview(),
      fetchStockAnalysisConfig(),
      fetchTradingStatus(),
    ])
    setConfig(configData)
    applyRuntimeState(data, tradingData)
  }, [applyRuntimeState])

  const refreshRuntimeState = useCallback(async (options?: { silent?: boolean }) => {
    if (runtimeRefreshInFlightRef.current || actionLoadingRef.current) {
      return
    }

    runtimeRefreshInFlightRef.current = true
    try {
      const [data, tradingData] = await Promise.all([
        fetchStockAnalysisOverview(),
        fetchTradingStatus(),
      ])
      applyRuntimeState(data, tradingData)
    } catch (requestError) {
      if (!options?.silent) {
        throw requestError
      }
    } finally {
      runtimeRefreshInFlightRef.current = false
    }
  }, [applyRuntimeState])

  useEffect(() => {
    actionLoadingRef.current = actionLoading
  }, [actionLoading])

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        await bootstrapStockAnalysis()
        if (cancelled) return
        await loadOverview()
      } catch (requestError) {
        if (!cancelled) {
          setError((requestError as Error).message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [loadOverview])

  useEffect(() => {
    if (loading) {
      return
    }

    const timer = window.setInterval(() => {
      if (document.hidden) {
        return
      }
      void refreshRuntimeState({ silent: true })
    }, getAutoRefreshIntervalMs(tradingStatus.canTrade))

    return () => {
      window.clearInterval(timer)
    }
  }, [loading, refreshRuntimeState, tradingStatus.canTrade])

  useEffect(() => {
    if (loading) {
      return
    }

    const handleFocus = () => {
      void refreshRuntimeState({ silent: true })
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void refreshRuntimeState({ silent: true })
      }
    }

    const handleOnline = () => {
      void refreshRuntimeState({ silent: true })
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
    }
  }, [loading, refreshRuntimeState])

  useEffect(() => {
    if (loading) {
      return
    }

    const timer = window.setTimeout(() => {
      if (!document.hidden) {
        void refreshRuntimeState({ silent: true })
      }
    }, getMsUntilNextMarketBoundary(new Date()))

    return () => {
      window.clearTimeout(timer)
    }
  }, [lastRefreshAt, loading, refreshRuntimeState])

  const topSignal = selectedSignal ?? overview?.topSignals[0] ?? null
  const totalSuggestedPosition = useMemo(() => {
    if (!overview) return 0
    return overview.positions.reduce((sum, position) => sum + position.weight, 0)
  }, [overview])
  const autoRefreshIntervalMs = useMemo(() => getAutoRefreshIntervalMs(tradingStatus.canTrade), [tradingStatus.canTrade])

  useEffect(() => {
    if (!topSignal) return
    setTargetWeight(Math.max(1, Math.round(topSignal.suggestedPosition * 100)))
  }, [topSignal])

  async function refreshAll() {
    setActionLoading(true)
    try {
      const result = await runStockAnalysisDaily()
      await loadOverview()
      showToast('success', '今日分析已完成')
      if (result.signalCount > 0 || result.watchCount > 0 || result.usedFallbackData) {
        void safeNotify(
          '今日分析已完成',
          `生成 ${result.signalCount} 个候选信号，观望 ${result.watchCount} 个${result.usedFallbackData ? '，当前含回退数据' : ''}`,
          result.usedFallbackData ? 'warning' : 'success',
          {
            dedupeKey: `daily-run:${result.tradeDate}:${result.signalCount}:${result.watchCount}:${result.usedFallbackData}`,
            riskPriority: result.usedFallbackData ? 'high' : 'medium',
            category: 'analysis',
          },
        )
      }
    } catch (requestError) {
      const message = (requestError as Error).message
      showToast('error', `运行分析失败: ${message}`)
      void safeNotify('今日分析失败', message, 'error', {
        dedupeKey: `daily-run-failed:${message}`,
        riskPriority: 'critical',
        category: 'analysis',
      })
    } finally {
      setActionLoading(false)
    }
  }

  async function refreshStockPool() {
    setActionLoading(true)
    try {
      const result = await refreshStockAnalysisStockPool()
      await loadOverview()
      showToast('success', '股票池已刷新')
      void safeNotify('股票池已刷新', `当前股票池共 ${result.count} 只`, 'info', {
        dedupeKey: `stock-pool-refresh:${result.count}`,
        riskPriority: 'medium',
        category: 'analysis',
      })
    } catch (requestError) {
      const message = (requestError as Error).message
      showToast('error', `刷新股票池失败: ${message}`)
      void safeNotify('刷新股票池失败', message, 'error', {
        dedupeKey: `stock-pool-failed:${message}`,
        riskPriority: 'high',
        category: 'analysis',
      })
    } finally {
      setActionLoading(false)
    }
  }

  async function executeSignalAction(signal: StockAnalysisSignal, mode: Exclude<ActionMode, null>, buyQuantity: number, currentNote: string) {
    setActionLoading(true)
    try {
      let successMessage = '信号处理完成'
      let notifyTitle = '策略信号已处理'
      let notifyLevel: 'info' | 'success' | 'warning' = 'success'
      let notifyMessage = `${signal.name}（${signal.code}）`

      if (mode === 'confirm') {
        await confirmStockAnalysisSignal(signal.id, {
          quantity: buyQuantity,
          weight: targetWeight / 100,
          note: currentNote.trim() || '用户确认执行 AI 策略',
        })
        successMessage = '已确认买入信号'
        notifyTitle = '已确认买入'
        notifyMessage = `${signal.name}（${signal.code}） ${buyQuantity} 股`
      } else if (mode === 'acknowledge') {
        await confirmStockAnalysisSignal(signal.id, {
          note: currentNote.trim() || (signal.action === 'watch' ? '用户确认观望' : '用户已阅'),
        })
        successMessage = signal.action === 'watch' ? '已确认观望' : '已标记已阅'
        notifyTitle = signal.action === 'watch' ? '已确认观望' : '策略信号已阅'
        notifyLevel = 'info'
      } else if (mode === 'override_buy') {
        await confirmStockAnalysisSignal(signal.id, {
          quantity: buyQuantity,
          weight: targetWeight / 100,
          note: currentNote.trim() || '用户推翻观望建议，主动买入',
        })
        successMessage = '已按主观判断买入'
        notifyTitle = '已主动买入'
        notifyMessage = `${signal.name}（${signal.code}） ${buyQuantity} 股`
      } else if (mode === 'reject') {
        await rejectStockAnalysisSignal(signal.id, currentNote.trim())
        successMessage = '已放弃该信号'
        notifyTitle = '已放弃买入信号'
        notifyLevel = 'warning'
      } else if (mode === 'ignore') {
        await ignoreStockAnalysisSignal(signal.id, currentNote.trim())
        successMessage = '已忽略该信号'
        notifyTitle = '已忽略策略信号'
        notifyLevel = 'info'
      }
      setActionMode(null)
      setNote('')
      await loadOverview()
      showToast('success', successMessage)
      void safeNotify(notifyTitle, notifyMessage, notifyLevel, {
        dedupeKey: `signal:${mode}:${signal.id}`,
        riskPriority: mode === 'confirm' || mode === 'override_buy' ? 'high' : 'medium',
        category: 'execution',
      })
    } catch (requestError) {
      const message = (requestError as Error).message
      showToast('error', `信号操作失败: ${message}`)
      void safeNotify('策略信号处理失败', `${signal.name}（${signal.code}）：${message}`, 'error', {
        batchKey: `signal-action-failed:${mode}`,
        batchTitle: '策略信号处理失败',
        batchMessageBuilder: (count, latestMessage) => `${latestMessage}${count > 1 ? `（近时间段内共 ${count} 次）` : ''}`,
        riskPriority: 'critical',
        category: 'execution',
      })
    } finally {
      setActionLoading(false)
    }
  }

  async function submitSignalAction() {
    if (!topSignal || !actionMode) return
    if ((actionMode === 'confirm' || actionMode === 'override_buy') && overview) {
      const label = actionMode === 'override_buy' ? '强制买入' : '确认买入'
      const capturedSignal = topSignal
      const capturedMode = actionMode
      const capturedQuantity = quantity
      const capturedNote = note
      const reasonSummary = topSignal.reasoning.slice(0, 2)
      setTradeConfirmState({
        kind: 'buy',
        title: `${label} ${topSignal.name}（${topSignal.code}）`,
        confirmLabel: label,
        riskTone: actionMode === 'override_buy' ? 'critical' : 'high',
        summary: '该操作将创建实际持仓，请在确认前再次核对策略信号与组合风控状态。',
        bullets: [
          `买入数量：${quantity} 股`,
          `信号动作：${signalLabel(topSignal.action)}，综合分 ${topSignal.finalScore}`,
          `目标仓位：${targetWeight}%（AI 建议 ${Math.round(topSignal.suggestedPosition * 100)}%）`,
          `止损价 / 止盈一：${topSignal.stopLossPrice.toFixed(2)} / ${topSignal.takeProfitPrice1.toFixed(2)}`,
          ...(reasonSummary.length > 0 ? reasonSummary : ['请确认该信号符合你当前的主观判断与执行纪律']),
        ],
        onConfirm: async () => {
          setTradeConfirmState(null)
          await executeSignalAction(capturedSignal, capturedMode, capturedQuantity, capturedNote)
        },
      })
      return
    }
    await executeSignalAction(topSignal, actionMode, quantity, note)
  }

  async function executePositionClose(position: StockAnalysisPosition) {
    setActionLoading(true)
    try {
      const trade = await closeStockAnalysisPosition(position.id, {
        quantity: position.quantity,
        note: `用户按风控建议手动平仓 ${position.name}`,
      })
      await loadOverview()
      showToast('success', `${position.name} 已平仓`)
      void safeNotify('持仓已平仓', `${position.name}（${position.code}）${trade.pnlPercent != null ? `，收益 ${trade.pnlPercent.toFixed(2)}%` : ''}`, 'success', {
        dedupeKey: `close-position:${position.id}:${trade.id}`,
        riskPriority: 'high',
        category: 'execution',
      })
    } catch (requestError) {
      const message = (requestError as Error).message
      showToast('error', `平仓失败: ${message}`)
      void safeNotify('平仓失败', `${position.name}（${position.code}）：${message}`, 'error', {
        batchKey: 'close-position-failed',
        batchTitle: '平仓失败',
        batchMessageBuilder: (count, latestMessage) => `${latestMessage}${count > 1 ? `（近时间段内共 ${count} 次）` : ''}`,
        riskPriority: 'critical',
        category: 'execution',
      })
    } finally {
      setActionLoading(false)
    }
  }

  async function submitPositionClose(position: StockAnalysisPosition) {
    if (overview && !tradeConfirmState) {
      const capturedPosition = position
      setTradeConfirmState({
        kind: 'close',
        title: `确认平仓 ${position.name}（${position.code}）`,
        confirmLabel: '确认平仓',
        riskTone: position.action === 'stop_loss' ? 'critical' : 'high',
        summary: '该操作会一次性卖出当前持仓，执行后不可撤销。',
        bullets: [
          `卖出数量：${position.quantity} 股`,
          `当前收益：${position.returnPercent.toFixed(2)}%`,
          `当前动作建议：${positionLabel(position.action)}`,
          `动作原因：${position.actionReason}`,
          `成本价 / 现价：${position.costPrice.toFixed(2)} / ${position.currentPrice.toFixed(2)}`,
        ],
        onConfirm: async () => {
          setTradeConfirmState(null)
          await executePositionClose(capturedPosition)
        },
      })
      return
    }
    await executePositionClose(position)
  }

  async function executePositionReduce(position: StockAnalysisPosition, reduceQuantity: number) {
    setActionLoading(true)
    try {
      const trade = await reduceStockAnalysisPosition(position.id, {
        quantity: reduceQuantity,
        note: `用户减仓 ${position.name} ${reduceQuantity}股`,
      })
      await loadOverview()
      showToast('success', `${position.name} 已减仓 ${reduceQuantity} 股`)
      void safeNotify('持仓已减仓', `${position.name}（${position.code}）减仓 ${reduceQuantity} 股${trade.pnlPercent != null ? `，本次收益 ${trade.pnlPercent.toFixed(2)}%` : ''}`, 'info', {
        dedupeKey: `reduce-position:${position.id}:${trade.id}`,
        riskPriority: 'high',
        category: 'execution',
      })
    } catch (requestError) {
      const message = (requestError as Error).message
      showToast('error', `减仓失败: ${message}`)
      void safeNotify('减仓失败', `${position.name}（${position.code}）：${message}`, 'error', {
        batchKey: 'reduce-position-failed',
        batchTitle: '减仓失败',
        batchMessageBuilder: (count, latestMessage) => `${latestMessage}${count > 1 ? `（近时间段内共 ${count} 次）` : ''}`,
        riskPriority: 'critical',
        category: 'execution',
      })
    } finally {
      setActionLoading(false)
    }
  }

  async function submitPositionReduce(position: StockAnalysisPosition, reduceQuantity: number) {
    if (overview && !tradeConfirmState) {
      const capturedPosition = position
      const capturedReduceQuantity = reduceQuantity
      setTradeConfirmState({
        kind: 'reduce',
        title: `确认减仓 ${position.name}（${position.code}）`,
        confirmLabel: '确认减仓',
        riskTone: 'high',
        summary: '该操作会部分卖出当前持仓，请确认是否符合你的止盈/控仓计划。',
        bullets: [
          `减仓数量：${reduceQuantity} 股`,
          `持仓总量：${position.quantity} 股`,
          `当前收益：${position.returnPercent.toFixed(2)}%`,
          `当前动作建议：${positionLabel(position.action)}`,
          `动作原因：${position.actionReason}`,
        ],
        onConfirm: async () => {
          setTradeConfirmState(null)
          await executePositionReduce(capturedPosition, capturedReduceQuantity)
        },
      })
      return
    }
    await executePositionReduce(position, reduceQuantity)
  }

  async function submitPositionDismiss(position: StockAnalysisPosition) {
    setActionLoading(true)
    try {
      await dismissPositionAction(position.id, `用户忽略 ${position.name} 的${position.action === 'stop_loss' ? '止损' : position.action === 'take_profit' ? '止盈' : position.action === 'reduce' ? '减仓' : '评估'}提醒`)
      await loadOverview()
      showToast('success', `已忽略 ${position.name} 的卖出提醒`)
      void safeNotify('已忽略卖出提醒', `${position.name}（${position.code}）`, 'info', {
        dedupeKey: `dismiss-position-action:${position.id}:${position.action}`,
        riskPriority: 'medium',
        category: 'risk',
      })
    } catch (requestError) {
      const message = (requestError as Error).message
      showToast('error', `忽略失败: ${message}`)
      void safeNotify('忽略卖出提醒失败', `${position.name}（${position.code}）：${message}`, 'error', {
        batchKey: 'dismiss-action-failed',
        batchTitle: '忽略卖出提醒失败',
        batchMessageBuilder: (count, latestMessage) => `${latestMessage}${count > 1 ? `（近时间段内共 ${count} 次）` : ''}`,
        riskPriority: 'high',
        category: 'risk',
      })
    } finally {
      setActionLoading(false)
    }
  }

  async function runPostMarket() {
    setActionLoading(true)
    try {
      const result = await runStockAnalysisPostMarket()
      await loadOverview()
      showToast('success', '盘后分析已完成')
      void safeNotify('盘后分析已完成', `生成 ${result.positionEvaluations.length} 条持仓评估，新增 ${result.reviewsGenerated} 条复盘`, result.riskControlState.paused ? 'warning' : 'success', {
        dedupeKey: `post-market:${result.tradeDate}:${result.generatedAt}`,
        riskPriority: result.riskControlState.paused ? 'high' : 'medium',
        category: 'analysis',
      })
    } catch (requestError) {
      const message = (requestError as Error).message
      showToast('error', `盘后分析失败: ${message}`)
      void safeNotify('盘后分析失败', message, 'error', {
        dedupeKey: `post-market-failed:${message}`,
        riskPriority: 'critical',
        category: 'analysis',
      })
    } finally {
      setActionLoading(false)
    }
  }

  async function toggleIntradayMonitor() {
    setActionLoading(true)
    try {
      const isRunning = overview?.systemStatus.intradayMonitor?.state === 'running'
      if (isRunning) {
        await stopIntradayMonitor()
        showToast('info', '盘中监控已停止')
        void safeNotify('盘中监控已停止', '已停止实时行情轮询与预警', 'info', {
          dedupeKey: 'intraday-monitor-stop',
          riskPriority: 'medium',
          category: 'monitor',
        })
      } else {
        await startIntradayMonitor()
        showToast('success', '盘中监控已启动')
        void safeNotify('盘中监控已启动', '已开始实时行情轮询与预警', 'success', {
          dedupeKey: 'intraday-monitor-start',
          riskPriority: 'medium',
          category: 'monitor',
        })
      }
      await loadOverview()
    } catch (requestError) {
      const message = (requestError as Error).message
      showToast('error', `监控操作失败: ${message}`)
      void safeNotify('盘中监控操作失败', message, 'error', {
        dedupeKey: `intraday-monitor-failed:${message}`,
        riskPriority: 'high',
        category: 'monitor',
      })
    } finally {
      setActionLoading(false)
    }
  }

  const intradayRunning = overview?.systemStatus.intradayMonitor?.state === 'running'

  useEffect(() => {
    if (!overview) {
      return
    }

    const nextSnapshot = new Map<string, string>()
    const nextAlerts = overview.positions.filter((position) => ACTIONABLE_POSITION_ACTIONS.has(position.action))

    for (const position of nextAlerts) {
      const signature = `${position.action}:${position.actionReason}`
      nextSnapshot.set(position.id, signature)
    }

    if (positionAlertSnapshotRef.current.size === 0) {
      positionAlertSnapshotRef.current = nextSnapshot
      return
    }

    const previousSnapshot = positionAlertSnapshotRef.current
    for (const position of nextAlerts) {
      const signature = nextSnapshot.get(position.id)
      const previousSignature = previousSnapshot.get(position.id)
      if (!signature || previousSignature === signature) {
        continue
      }

      void safeNotify(
        `新增${positionLabel(position.action)}提醒`,
        `${position.name}（${position.code}）：${position.actionReason}`,
        position.action === 'stop_loss' ? 'error' : position.action === 'take_profit' ? 'success' : 'warning',
        {
          batchKey: 'position-sell-alert',
          batchTitle: '新增待处理卖出提醒',
          batchMessageBuilder: (count, latestMessage) => count > 1 ? `${latestMessage}，另有 ${count - 1} 条待处理卖出提醒` : latestMessage,
          riskPriority: position.action === 'stop_loss' ? 'critical' : position.action === 'take_profit' ? 'high' : 'high',
          category: 'risk',
        },
      )
    }

    positionAlertSnapshotRef.current = nextSnapshot
  }, [overview, safeNotify])

  useEffect(() => {
    if (!overview) {
      return
    }

    const nextSnapshot = {
      paused: overview.systemStatus.riskControl.paused,
      pauseReason: overview.systemStatus.riskControl.pauseReason,
    }

    if (!riskControlSnapshotRef.current) {
      riskControlSnapshotRef.current = nextSnapshot
      return
    }

    const previous = riskControlSnapshotRef.current
    if (!previous.paused && nextSnapshot.paused) {
      void safeNotify(
        '风控已暂停交易',
        nextSnapshot.pauseReason || '系统已触发组合级风险控制，请立即检查持仓与风控状态',
        'error',
        {
          dedupeKey: `risk-pause:${nextSnapshot.pauseReason || 'unknown'}`,
          riskPriority: 'critical',
          category: 'risk',
        },
      )
    } else if (previous.paused && !nextSnapshot.paused) {
      void safeNotify('风控暂停已解除', '系统已恢复交易能力，请结合市场状态谨慎操作', 'success', {
        dedupeKey: 'risk-pause-lifted',
        riskPriority: 'high',
        category: 'risk',
      })
    }

    riskControlSnapshotRef.current = nextSnapshot
  }, [overview, safeNotify])

  useEffect(() => {
    if (!overview) {
      return
    }

    const nextSnapshot = {
      dataState: overview.systemStatus.dataState,
      staleReasonsKey: overview.systemStatus.staleReasons.join('|'),
    }

    if (!dataStateSnapshotRef.current) {
      dataStateSnapshotRef.current = nextSnapshot
      return
    }

    const previous = dataStateSnapshotRef.current
    const enteredRiskyDataState = previous.dataState === 'ready' && nextSnapshot.dataState !== 'ready'
    const staleReasonChanged = previous.staleReasonsKey !== nextSnapshot.staleReasonsKey && nextSnapshot.dataState !== 'ready'
    const dataRecovered = previous.dataState !== 'ready' && nextSnapshot.dataState === 'ready'

    if (enteredRiskyDataState || staleReasonChanged) {
      const summary = overview.systemStatus.staleReasons.length > 0
        ? overview.systemStatus.staleReasons.slice(0, 2).join('；')
        : overview.systemStatus.lastError || '当前分析使用了不稳定数据，请先核查后再做交易判断'
      void safeNotify('AI 炒股数据状态异常', summary, 'warning', {
        dedupeKey: `data-state:${nextSnapshot.dataState}:${nextSnapshot.staleReasonsKey}`,
        riskPriority: 'high',
        category: 'data',
      })
    } else if (dataRecovered) {
      void safeNotify('AI 炒股数据已恢复', '行情与分析数据已恢复正常，可继续参考系统建议', 'success', {
        dedupeKey: 'data-state-recovered',
        riskPriority: 'medium',
        category: 'data',
      })
    }

    dataStateSnapshotRef.current = nextSnapshot
  }, [overview, safeNotify])

  useEffect(() => {
    if (!overview) {
      return
    }

    const nextKey = overview.swapSuggestions
      .map((item) => `${item.sellPositionId}:${item.buySignalId}:${item.scoreDifference}`)
      .sort()
      .join('|')

    if (!swapSuggestionSnapshotRef.current) {
      swapSuggestionSnapshotRef.current = nextKey
      return
    }

    if (nextKey && nextKey !== swapSuggestionSnapshotRef.current) {
      const nextSuggestions = overview.swapSuggestions
      const topSuggestion = nextSuggestions[0]
      void safeNotify(
        '新增换仓建议',
        nextSuggestions.length > 1
          ? `${topSuggestion.sellName} -> ${topSuggestion.buyName}，另有 ${nextSuggestions.length - 1} 条换仓建议`
          : `${topSuggestion.sellName} -> ${topSuggestion.buyName}，优势 +${topSuggestion.scoreDifference} 分`,
        'warning',
        {
          dedupeKey: `swap-suggestion:${nextKey}`,
          riskPriority: 'high',
          category: 'risk',
        },
      )
    }

    swapSuggestionSnapshotRef.current = nextKey
  }, [overview, safeNotify])

  useEffect(() => {
    if (!intradayRunning) {
      intradayAlertSnapshotRef.current.clear()
      return
    }

    let cancelled = false

    const loadIntradayAlerts = async () => {
      try {
        const alerts = await fetchIntradayAlerts()
        if (cancelled) {
          return
        }

        const nextActiveIds = new Set(
          alerts
            .filter((alert) => !alert.acknowledged)
            .map((alert) => alert.id),
        )

        for (const alert of alerts) {
          if (alert.acknowledged || intradayAlertSnapshotRef.current.has(alert.id)) {
            continue
          }

          void safeNotify(
            `盘中${INTRADAY_ALERT_LABELS[alert.alertType] ?? alert.alertType}预警`,
            `${alert.name}（${alert.code}）：${alert.message}`,
            getIntradayAlertLevel(alert.alertType),
            {
              batchKey: 'intraday-alert',
              batchTitle: '新增盘中预警',
              batchMessageBuilder: (count, latestMessage) => count > 1 ? `${latestMessage}，另有 ${count - 1} 条盘中预警` : latestMessage,
              riskPriority: alert.alertType === 'stop_loss' || alert.alertType === 'daily_loss_limit' ? 'critical' : 'high',
              category: 'intraday',
              metadata: {
                alertType: alert.alertType,
                code: alert.code,
              },
            },
          )
        }

        intradayAlertSnapshotRef.current = nextActiveIds
      } catch {
        // 盘中预警轮询失败不打断主流程
      }
    }

    void loadIntradayAlerts()
    const timer = window.setInterval(() => {
      void loadIntradayAlerts()
    }, 15_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [intradayRunning, safeNotify])

  return (
    <div className="flex h-full w-full bg-slate-50/60 backdrop-blur-md">
      <div className="w-52 border-r border-slate-200/60 bg-white/50 flex flex-col">
        <div className="p-4 flex items-center gap-2">
          <ChartBarIcon className="w-6 h-6 text-indigo-600" />
          <h1 className="font-bold text-slate-800">AI 炒股</h1>
        </div>
        <nav className="flex-1 px-2 space-y-1">
          <TabButton tab="dashboard" icon={<ChartBarIcon className="w-5 h-5" />} label="总览看板" activeTab={activeTab} onClick={setActiveTab} />
          <TabButton tab="strategies" icon={<LightBulbIcon className="w-5 h-5" />} label="每日策略" activeTab={activeTab} onClick={setActiveTab} />
          <TabButton tab="watchlist" icon={<StarIcon className="w-5 h-5" />} label="自选股票" activeTab={activeTab} onClick={setActiveTab} />
          <TabButton tab="risk" icon={<ShieldCheckIcon className="w-5 h-5" />} label="持仓风控" activeTab={activeTab} onClick={setActiveTab} />
          <TabButton tab="memory" icon={<ClockIcon className="w-5 h-5" />} label="记忆复盘" activeTab={activeTab} onClick={setActiveTab} />
          <TabButton tab="profile" icon={<UserIcon className="w-5 h-5" />} label="行为画像" activeTab={activeTab} onClick={setActiveTab} />
          <TabButton tab="aiconfig" icon={<CpuChipIcon className="w-5 h-5" />} label="AI 配置" activeTab={activeTab} onClick={setActiveTab} />
          <TabButton tab="expert_analysis" icon={<MagnifyingGlassIcon className="w-5 h-5" />} label="AI专家分析" activeTab={activeTab} onClick={setActiveTab} />
          <TabButton tab="data_collection" icon={<CircleStackIcon className="w-5 h-5" />} label="AI数据收集" activeTab={activeTab} onClick={setActiveTab} />
          <TabButton tab="guide" icon={<BookOpenIcon className="w-5 h-5" />} label="系统说明" activeTab={activeTab} onClick={setActiveTab} />
        </nav>
        {overview ? <StatusBanner overview={overview} /> : null}
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="h-14 border-b border-slate-200/60 bg-white/50 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${overview?.marketState.trend === 'bear_trend' ? 'bg-red-500' : overview?.marketState.trend === 'bull_trend' ? 'bg-green-500' : 'bg-amber-500'} animate-pulse`} />
              <span className="text-sm font-medium text-slate-700">
                当前市场: {overview ? `${trendLabel(overview.marketState.trend)} / ${volatilityLabel(overview.marketState.volatility)}` : '载入中'}
              </span>
            </div>
            <div className="text-sm text-slate-500">
              建议总仓位: <span className="font-bold text-slate-700">{Math.round(totalSuggestedPosition * 100)}%</span>
            </div>
            {overview ? (
              <div className={`text-xs px-2 py-1 rounded-full border ${overview.systemStatus.dataState === 'ready' ? 'bg-green-50 text-green-700 border-green-200' : overview.systemStatus.dataState === 'stale' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {dataStateLabel(overview.systemStatus.dataState)}
              </div>
            ) : null}
            <div className="text-xs text-slate-400">
              自动刷新 {Math.round(autoRefreshIntervalMs / 1000)}s
              {lastRefreshAt ? ` · 上次更新 ${new Date(lastRefreshAt).toLocaleTimeString('zh-CN')}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void toggleIntradayMonitor()} disabled={actionLoading} title={intradayRunning ? '停止盘中实时监控' : '启动盘中实时监控，定时刷新行情与预警'} className={`px-3 py-2 rounded-lg border text-sm font-medium disabled:opacity-50 ${intradayRunning ? 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100' : 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'}`}>
              {intradayRunning ? '停止监控' : '盘中监控'}
            </button>
            <button onClick={() => void runPostMarket()} disabled={actionLoading} title="收盘后运行数据采集、专家分析与记忆更新" className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
              盘后分析
            </button>
            <button onClick={() => void refreshStockPool()} disabled={actionLoading} title="重新扫描并更新待分析的股票池列表" className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
              刷新股票池
            </button>
            <button onClick={() => void refreshAll()} disabled={actionLoading} title="执行今日完整分析流程：数据采集 → 专家投票 → 信号生成" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              <ArrowPathIcon className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
              运行今日分析
            </button>
          </div>
        </div>

        <div className={`flex-1 p-6 ${activeTab === 'watchlist' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={() => void loadOverview()} /> : overview ? (
            <>
              {aiRiskNotifications.length > 0 ? (
                <div className="mb-4 rounded-2xl border border-slate-200/60 bg-white/75 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">关键通知历史</h3>
                      <p className="text-xs text-slate-500 mt-1">仅展示 AI 炒股与真金白银决策直接相关的关键事件</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {aiRiskNotifications.map((item) => {
                      const riskPriority = typeof item.metadata.riskPriority === 'string' ? item.metadata.riskPriority : 'medium'
                      const category = typeof item.metadata.category === 'string' ? item.metadata.category : 'general'
                      const toneClass = riskPriority === 'critical'
                        ? 'border-red-200 bg-red-50/70'
                        : riskPriority === 'high'
                          ? 'border-amber-200 bg-amber-50/70'
                          : 'border-slate-200 bg-slate-50/70'
                      const badgeClass = riskPriority === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : riskPriority === 'high'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      const badgeText = riskPriority === 'critical' ? '高危' : riskPriority === 'high' ? '重要' : '关注'
                      return (
                        <div key={item.id} className={`rounded-xl border px-4 py-3 ${toneClass}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${badgeClass}`}>{badgeText}</span>
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-white/70 text-slate-600 border border-white/80">{category}</span>
                                <span className="font-semibold text-slate-800 text-sm">{item.title}</span>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed">{item.message}</p>
                            </div>
                            <div className="flex items-start gap-2 flex-shrink-0">
                              <span className="text-[11px] text-slate-400 whitespace-nowrap">{new Date(item.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                              <button
                                type="button"
                                onClick={() => void removeNotification(item.id)}
                                className="rounded-md p-1 text-slate-400 hover:bg-white/70 hover:text-slate-600"
                                title="删除这条通知"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              {activeTab === 'dashboard' && <DashboardTab overview={overview} onOverviewUpdate={(o) => setOverview(o)} />}
              {activeTab === 'strategies' && (
                <StrategiesTab
                  overview={overview}
                  topSignal={topSignal}
                  actionMode={actionMode}
                  setActionMode={setActionMode}
                  note={note}
                  setNote={setNote}
                  quantity={quantity}
                  setQuantity={setQuantity}
                  targetWeight={targetWeight}
                  setTargetWeight={setTargetWeight}
                  onSubmit={() => void submitSignalAction()}
                  actionLoading={actionLoading}
                  onSelectSignal={setSelectedSignal}
                  onClosePosition={(position) => void submitPositionClose(position)}
                  onReducePosition={(position, qty) => void submitPositionReduce(position, qty)}
                  onDismissAction={(position) => void submitPositionDismiss(position)}
                  tradingStatus={tradingStatus}
                />
              )}
              {activeTab === 'risk' && <RiskTab overview={overview} onClosePosition={(position) => void submitPositionClose(position)} onReducePosition={(position, qty) => void submitPositionReduce(position, qty)} actionLoading={actionLoading} tradingStatus={tradingStatus} />}
              {activeTab === 'memory' && <MemoryTab overview={overview} config={config} />}
              {activeTab === 'profile' && <ProfileTab overview={overview} />}
              {activeTab === 'aiconfig' && <AIConfigTab />}
              {activeTab === 'expert_analysis' && <ExpertAnalysisTab />}
              {activeTab === 'data_collection' && <DataCollectionTab />}
              {activeTab === 'guide' && <GuideTab />}
              {activeTab === 'watchlist' && <WatchlistTab />}
            </>
          ) : null}
        </div>
      </div>

      {tradeConfirmState && overview ? (
        <TradeConfirmDialog
          state={tradeConfirmState}
          overview={overview}
          tradingStatus={tradingStatus}
          actionLoading={actionLoading}
          onCancel={() => setTradeConfirmState(null)}
          onConfirm={() => void tradeConfirmState.onConfirm()}
        />
      ) : null}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
