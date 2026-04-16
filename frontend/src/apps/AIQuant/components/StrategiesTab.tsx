import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'

import type { StockAnalysisOverview, StockAnalysisPosition, StockAnalysisSignal } from '../types'
import { buildConvictionStats, buildDailyAdviceSummary } from '../dashboardMeta'
import {
  decisionSourceLabel,
  formatPercent,
  formatPrice,
  isTPlusOneBlocked,
  marketRegimeLabel,
  percentTone,
  signalBadge,
  signalLabel,
} from '../utils'
import {
  InfoPanel,
  ScoreRow,
} from './shared'

type ActionMode = 'confirm' | 'reject' | 'ignore' | 'acknowledge' | 'override_buy' | null

export interface StrategiesTabProps {
  overview: StockAnalysisOverview
  topSignal: StockAnalysisSignal | null
  actionMode: ActionMode
  setActionMode: (mode: ActionMode) => void
  note: string
  setNote: (value: string) => void
  quantity: number
  setQuantity: (value: number) => void
  targetWeight: number
  setTargetWeight: (value: number) => void
  onSubmit: () => void
  actionLoading: boolean
  onSelectSignal: (signal: StockAnalysisSignal) => void
  onClosePosition: (position: StockAnalysisPosition) => void
  onReducePosition: (position: StockAnalysisPosition, reduceQuantity: number) => void
  onDismissAction: (position: StockAnalysisPosition) => void
  tradingStatus: { canTrade: boolean; reason: string | null }
  onAutoExecute: () => void
}

export function StrategiesTab(props: StrategiesTabProps) {
  const { overview, topSignal, actionMode, setActionMode, note, setNote, quantity, setQuantity, targetWeight, setTargetWeight, onSubmit, actionLoading, onSelectSignal, onClosePosition, onReducePosition, onDismissAction, tradingStatus, onAutoExecute } = props
  const conviction = buildConvictionStats(overview.topSignals, overview.marketState)
  const isBuySignal = topSignal ? (topSignal.action === 'strong_buy' || topSignal.action === 'buy') : false
  const isAlreadyOperated = topSignal ? topSignal.decisionSource !== 'system' : false
  const operatedInfo = topSignal ? decisionSourceLabel(topSignal.decisionSource, topSignal.action) : null
  const currentTotalPosition = overview.positions.reduce((sum, position) => sum + position.weight, 0)
  const maxTotalPosition = overview.marketLevelRisk?.effectiveMaxPositionRatio ?? 0.85
  const remainingPositionPercent = Math.max(0, Math.round((maxTotalPosition - currentTotalPosition) * 100))

  /** 判断该操作是否需要交易时间 */
  function needsTradingTime(mode: ActionMode): boolean {
    return mode === 'confirm' || mode === 'override_buy'
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 交易状态提示条 */}
      {!tradingStatus.canTrade ? (
        <div className="flex-shrink-0 mb-2 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-700 text-xs flex items-center gap-2">
          <LockClosedIcon className="w-4 h-4 flex-shrink-0" />
          <span>{tradingStatus.reason} — 交易操作（买入/卖出/减仓/平仓）已禁用，仅可查看和标记信号。</span>
        </div>
      ) : null}

      {/* 统计信息条 */}
      <div className="flex-shrink-0 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">每日策略</h2>
            <button
              onClick={onAutoExecute}
              disabled={actionLoading}
              title="对今日「强烈买入」信号按推荐顺序自动开仓（每只 30%，总仓位 100% 上限），并将「买入」「观望」信号自动标记为忽略"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              一键自动执行
            </button>
          </div>
          {overview.marketRegime && overview.fusionWeights ? (
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="font-medium text-indigo-600">{marketRegimeLabel(overview.marketRegime)}</span>
              <span>专家 {(overview.fusionWeights.expert * 100).toFixed(0)}% / 技术 {(overview.fusionWeights.technical * 100).toFixed(0)}% / 量化 {(overview.fusionWeights.quant * 100).toFixed(0)}%</span>
            </div>
          ) : null}
        </div>
        <div className="bg-white/70 border border-slate-200/60 rounded-2xl px-4 py-2 shadow-sm">
          <div className="flex items-center gap-5 text-sm">
            <span className="text-slate-500">强买入 <span className="font-bold text-red-600">{conviction.strongBuyCount}</span></span>
            <span className="text-slate-500">买入 <span className="font-bold text-red-600">{conviction.buyCount}</span></span>
            <span className="text-slate-500">观望 <span className="font-bold text-slate-800">{conviction.watchCount}</span></span>
            <span className="text-slate-500">平均综合分 <span className="font-bold text-slate-800">{conviction.avgScore.toFixed(1)}</span></span>
          </div>
        </div>
      </div>

      {/* ======== 左右主布局 ======== */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* -- 左侧 70%：选中股票详情 -- */}
        <div className="w-[70%] flex-shrink-0 overflow-y-auto">
          {/* 待处理卖出区域 */}
          {(() => {
            const advice = buildDailyAdviceSummary(overview)
            if (advice.sells.length === 0) return null
            return (
              <div className="mb-3 space-y-2">
                <h3 className="text-sm font-bold text-red-600 flex items-center gap-1.5">
                  <ExclamationTriangleIcon className="w-4 h-4" />
                  待处理卖出（{advice.sells.length}）
                </h3>
                {advice.sells.map((sell) => {
                  const position = overview.positions.find((p) => p.code === sell.code)
                  if (!position) return null
                  const tPlusOneBlocked = isTPlusOneBlocked(position.openedAt)
                  return (
                    <div key={sell.code} className="flex items-center justify-between gap-3 p-2.5 border border-red-200 bg-red-50/60 rounded-xl">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-800">{sell.title}</span>
                          <span className="text-xs text-slate-500">{sell.code}</span>
                        </div>
                        <div className="text-xs text-red-600 mt-0.5">{sell.summary}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          收益 <span className={position.returnPercent >= 0 ? 'text-red-600' : 'text-green-600'}>{position.returnPercent.toFixed(2)}%</span>
                          {' · '}持仓 {position.quantity} 股
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {tradingStatus.canTrade && !tPlusOneBlocked ? (
                          <>
                            <button
                              onClick={() => {
                                const qty = Math.floor(position.quantity / 2 / 100) * 100
                                if (qty > 0) onReducePosition(position, qty)
                              }}
                              disabled={actionLoading || position.quantity < 200}
                              className="px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-50"
                            >
                              减半
                            </button>
                            <button
                              onClick={() => onClosePosition(position)}
                              disabled={actionLoading}
                              className="px-3 py-1.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50"
                            >
                              平仓
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">{tPlusOneBlocked ? 'T+1 限制中' : '非交易时间'}</span>
                        )}
                        <button
                          onClick={() => onDismissAction(position)}
                          disabled={actionLoading}
                          className="px-3 py-1.5 text-xs font-medium bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg disabled:opacity-50"
                          title="忽略本次提醒，下次行情刷新时重新评估"
                        >
                          忽略
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {topSignal ? (
            <div className="bg-white/70 border border-indigo-100 rounded-2xl p-3 shadow-sm shadow-indigo-50 relative overflow-hidden min-h-full">
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
              {/* 头部：信号基本信息 + 综合得分 */}
              <div className="flex justify-between items-start gap-6 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded ${signalBadge(topSignal.action)}`}>{signalLabel(topSignal.action)}</span>
                    <span className="text-lg font-bold text-slate-800">{topSignal.name} ({topSignal.code})</span>
                    <span className="text-xs text-slate-500">{topSignal.tradeDate}</span>
                    {/* 已操作状态标签 */}
                    {isAlreadyOperated && operatedInfo ? (
                      <span className={`px-2 py-0.5 text-xs font-bold rounded ${operatedInfo.badge}`}>{operatedInfo.label}</span>
                    ) : null}
                  </div>
                  <div className={`grid ${isBuySignal ? 'grid-cols-4' : 'grid-cols-1'} gap-3 mt-2 text-sm`}>
                    <div>现价: <span className="font-semibold">{topSignal.latestPrice.toFixed(2)}</span> <span className={`font-bold text-xs ${topSignal.snapshot.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>{topSignal.snapshot.changePercent >= 0 ? '+' : ''}{topSignal.snapshot.changePercent.toFixed(2)}%</span></div>
                    {isBuySignal ? (
                      <>
                        <div>仓位: <span className="font-semibold">{Math.round(topSignal.suggestedPosition * 100)}%</span></div>
                        <div className="text-red-600">止盈: <span className="font-semibold">{topSignal.takeProfitPrice1.toFixed(2)} / {topSignal.takeProfitPrice2.toFixed(2)}</span></div>
                        <div className="text-green-600">止损: <span className="font-semibold">{topSignal.stopLossPrice.toFixed(2)}</span></div>
                      </>
                    ) : null}
                  </div>
                  {/* 当日 OHLC 行情 */}
                  <div className="grid grid-cols-4 gap-3 mt-1.5 text-xs text-slate-500">
                    <div>开盘 <span className="font-semibold text-slate-700">{formatPrice(topSignal.snapshot.open)}</span></div>
                    <div>最高 <span className="font-semibold text-red-600">{formatPrice(topSignal.snapshot.high)}</span></div>
                    <div>最低 <span className="font-semibold text-green-600">{formatPrice(topSignal.snapshot.low)}</span></div>
                    <div>昨收 <span className="font-semibold text-slate-700">{formatPrice(topSignal.snapshot.previousClose)}</span></div>
                  </div>
                  {topSignal.supportResistance ? (
                    <div className="flex items-center gap-4 mt-2 text-xs">
                      <span className="text-slate-400">支撑/压力位</span>
                      <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                        S1 {topSignal.supportResistance.support1.toFixed(2)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                        S2 {topSignal.supportResistance.support2.toFixed(2)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                        R1 {topSignal.supportResistance.resistance1.toFixed(2)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                        R2 {topSignal.supportResistance.resistance2.toFixed(2)}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="text-right min-w-[160px]">
                  <div className="text-xs text-slate-500 mb-1">综合得分</div>
                  <div className="flex items-center gap-2 justify-end">
                    <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${topSignal.finalScore}%` }} />
                    </div>
                    <span className="font-bold text-indigo-600">{topSignal.finalScore}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">置信度 {Math.round(topSignal.confidence * 100)}%</div>
                </div>
              </div>

              {/* 三流评分 + 核心理由 */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-slate-50/70 rounded-xl p-3 border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">三流评分</h4>
                  {topSignal.expert.isSimulated ? (
                    <div className="mb-2 rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-1.5 text-[11px] text-amber-700 leading-relaxed">
                      当前"专家共识"由规则公式模拟，非真实 LLM 集群输出。
                    </div>
                  ) : topSignal.expert.llmSuccessCount != null && topSignal.expert.llmSuccessCount > 0 ? (
                    <div className="mb-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-2.5 py-1.5 text-[11px] text-emerald-700 leading-relaxed">
                      LLM 专家已接入 — 成功 {topSignal.expert.llmSuccessCount} 票
                      {(topSignal.expert.ruleFallbackCount ?? 0) > 0
                        ? `，规则降级 ${topSignal.expert.ruleFallbackCount} 票`
                        : null}
                    </div>
                  ) : null}
                  <div className="space-y-1.5 text-sm">
                    <ScoreRow label="专家共识" value={`${Math.round(topSignal.expert.consensus * 100)}% / ${topSignal.expert.score}`} />
                    <ScoreRow label="技术分" value={`${topSignal.technical.total}`} />
                    <ScoreRow label="量化分" value={`${topSignal.quant.total}`} />
                    <ScoreRow label="20日收益" value={formatPercent(topSignal.snapshot.return20d)} valueClassName={percentTone(topSignal.snapshot.return20d)} />
                    <ScoreRow label="量能突破" value={`${topSignal.snapshot.volumeBreakout.toFixed(2)}x`} />
                    <ScoreRow label="基础门槛" value={`综 ${topSignal.thresholds.minCompositeScore} / 专 ${topSignal.thresholds.minExpertConsensus} / 技 ${topSignal.thresholds.minTechnicalScore} / 量 ${topSignal.thresholds.minQuantScore}`} />
                    {topSignal.fusionWeights ? (
                      <ScoreRow label="融合权重" value={`专家 ${(topSignal.fusionWeights.expert * 100).toFixed(0)}% / 技术 ${(topSignal.fusionWeights.technical * 100).toFixed(0)}% / 量化 ${(topSignal.fusionWeights.quant * 100).toFixed(0)}%`} />
                    ) : null}
                    {topSignal.marketRegime ? (
                      <ScoreRow label="市场体制" value={marketRegimeLabel(topSignal.marketRegime)} />
                    ) : null}
                  </div>
                </div>
                <div className="bg-slate-50/70 rounded-xl p-3 border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">核心理由</h4>
                  <div className="space-y-1.5 text-sm text-slate-700 leading-relaxed">
                    {topSignal.reasoning.map((reason) => <p key={reason}>- {reason}</p>)}
                  </div>
                </div>
              </div>

              {/* 通过/观望/否决 */}
              <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
                <InfoPanel title="通过条件" items={topSignal.passingChecks} emptyText="暂无通过条件" tone="green" />
                <InfoPanel title="观望原因" items={topSignal.watchReasons} emptyText="当前无观望原因" tone="amber" />
                <InfoPanel title="否决原因" items={topSignal.vetoReasons} emptyText="当前无否决条件" tone="red" />
              </div>

              {/* 操作区域 — 已操作 vs 待操作 */}
              {isAlreadyOperated && operatedInfo ? (
                /* 已操作：显示状态 + 用户备注，不再显示操作按钮 */
                <div className="pt-3 border-t border-slate-100">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${operatedInfo.badge}`}>
                    <CheckCircleIcon className="w-4 h-4" />
                    <span className="text-sm font-semibold">今日已操作：{operatedInfo.label}</span>
                    {topSignal.userDecisionNote ? (
                      <span className="text-xs opacity-75 ml-2">— {topSignal.userDecisionNote}</span>
                    ) : null}
                  </div>
                </div>
              ) : (
                /* 待操作：显示操作按钮 */
                <>
                  <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                    {(topSignal.action === 'strong_buy' || topSignal.action === 'buy') ? (
                      <>
                        <button
                          onClick={() => setActionMode('confirm')}
                          disabled={!tradingStatus.canTrade}
                          title={!tradingStatus.canTrade ? tradingStatus.reason ?? '非交易时间' : ''}
                          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <CheckCircleIcon className="w-4 h-4" /> 确认买入
                        </button>
                        <button onClick={() => setActionMode('reject')} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors">
                          <ExclamationTriangleIcon className="w-4 h-4" /> 放弃买入
                        </button>
                        <button onClick={() => setActionMode('ignore')} className="flex items-center gap-1.5 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-semibold rounded-lg transition-colors">
                          <XCircleIcon className="w-4 h-4" /> 忽略
                        </button>
                      </>
                    ) : topSignal.action === 'watch' ? (
                      <>
                        <button onClick={() => setActionMode('acknowledge')} className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors">
                          <CheckCircleIcon className="w-4 h-4" /> 确认观望
                        </button>
                        <button
                          onClick={() => setActionMode('override_buy')}
                          disabled={!tradingStatus.canTrade}
                          title={!tradingStatus.canTrade ? tradingStatus.reason ?? '非交易时间' : ''}
                          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ExclamationTriangleIcon className="w-4 h-4" /> 我要买入
                        </button>
                        <button onClick={() => setActionMode('ignore')} className="flex items-center gap-1.5 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-semibold rounded-lg transition-colors">
                          <XCircleIcon className="w-4 h-4" /> 忽略
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setActionMode('acknowledge')} className="flex items-center gap-1.5 px-4 py-2 bg-slate-400 hover:bg-slate-500 text-white text-sm font-semibold rounded-lg transition-colors">
                          <CheckCircleIcon className="w-4 h-4" /> 已阅
                        </button>
                        <button
                          onClick={() => setActionMode('override_buy')}
                          disabled={!tradingStatus.canTrade}
                          title={!tradingStatus.canTrade ? tradingStatus.reason ?? '非交易时间' : ''}
                          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ExclamationTriangleIcon className="w-4 h-4" /> 我要买入
                        </button>
                      </>
                    )}
                  </div>

                  {actionMode ? (
                    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl animate-in fade-in slide-in-from-top-2 space-y-3">
                      {/* confirm 和 override_buy 都展示数量/价格表单 */}
                      {(actionMode === 'confirm' || actionMode === 'override_buy') ? (
                        <>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">委托数量</label>
                              <input type="number" value={quantity} min={100} step={100} onChange={(event) => setQuantity(Number(event.target.value))} className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">建议价区间</label>
                              <div className="h-[38px] px-3 rounded-lg border border-slate-200 bg-white flex items-center text-sm text-slate-700">{topSignal.suggestedPriceRange.min.toFixed(2)} - {topSignal.suggestedPriceRange.max.toFixed(2)}</div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">目标仓位(%)</label>
                              <input
                                type="number"
                                value={targetWeight}
                                min={1}
                                max={100}
                                step={1}
                                onChange={(event) => setTargetWeight(Number(event.target.value))}
                                className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                            </div>
                          </div>
                          <div>
                            <input
                              type="range"
                              min={1}
                              max={100}
                              step={1}
                              value={targetWeight}
                              onChange={(event) => setTargetWeight(Number(event.target.value))}
                              className="w-full accent-indigo-600"
                            />
                          </div>
                          <div className="text-xs text-slate-500 -mt-1">
                            AI 建议仓位 {Math.round(topSignal.suggestedPosition * 100)}%，可手动调整；后端仍会校验单票仓位、总仓位和市场风控上限。
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                            当前已用总仓位 {Math.round(currentTotalPosition * 100)}%，当前市场有效总仓上限 {Math.round(maxTotalPosition * 100)}%，理论剩余可用 {remainingPositionPercent}% 。
                          </div>
                        </>
                      ) : null}

                      {/* acknowledge 不需要表单，显示确认提示 */}
                      {actionMode === 'acknowledge' ? (
                        <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                          {topSignal.action === 'watch'
                            ? '确认观望：系统将持续追踪此标的，后续符合条件时会再次提醒。'
                            : '标记已阅：此信号将被标记为已处理。'}
                        </div>
                      ) : null}

                      {/* reject 和 ignore 需要必填备注 */}
                      {(actionMode === 'reject' || actionMode === 'ignore') ? (
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">备注</label>
                          <textarea value={note} onChange={(event) => setNote(event.target.value)} className="w-full h-20 p-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white" placeholder="必须记录原因，供系统复盘学习" />
                        </div>
                      ) : null}

                      {/* confirm / override_buy 的备注是可选的 */}
                      {(actionMode === 'confirm' || actionMode === 'override_buy') ? (
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">备注（可选）</label>
                          <textarea value={note} onChange={(event) => setNote(event.target.value)} className="w-full h-16 p-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white" placeholder={actionMode === 'override_buy' ? '推翻原因' : '执行说明'} />
                        </div>
                      ) : null}

                      {/* 交易时间提醒（如果选择了需要交易时间的操作但市场关闭） */}
                      {needsTradingTime(actionMode) && !tradingStatus.canTrade ? (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          {tradingStatus.reason} — 提交后后端将拒绝此操作。
                        </div>
                      ) : null}

                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setActionMode(null); setNote('') }} className="px-3 py-1.5 text-sm text-slate-600 font-medium hover:bg-slate-200 rounded-lg">取消</button>
                        <button
                          onClick={onSubmit}
                          disabled={actionLoading || ((actionMode === 'reject' || actionMode === 'ignore') && !note.trim()) || ((actionMode === 'confirm' || actionMode === 'override_buy') && quantity <= 0)}
                          className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50"
                        >
                          提交
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-500">当前没有可展示的策略结果。</div>
          )}
        </div>

        {/* -- 右侧 30%：候选策略列表（固定高度滚动） -- */}
        <div className="w-[30%] flex-shrink-0 flex flex-col min-h-0">
          <h3 className="text-sm font-bold text-slate-800 mb-2 flex-shrink-0">候选策略列表 <span className="text-xs font-normal text-slate-400">({overview.topSignals.length})</span></h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-10">
            {overview.topSignals.map((signal) => {
              const signalOperated = signal.decisionSource !== 'system'
              const signalInfo = decisionSourceLabel(signal.decisionSource, signal.action)
              return (
                <button key={signal.id} onClick={() => onSelectSignal(signal)} className={`w-full text-left rounded-2xl border p-2.5 bg-white/70 shadow-sm hover:border-indigo-200 transition-colors ${signal.id === topSignal?.id ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200/60'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 text-sm truncate">{signal.name} ({signal.code})</div>
                      <div className="text-xs text-slate-500 mt-0.5">{signal.sector} | 综合分 {signal.finalScore}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${signalBadge(signal.action)}`}>{signalLabel(signal.action)}</span>
                      {signalOperated ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${signalInfo.badge}`}>{signalInfo.label}</span>
                      ) : null}
                    </div>
                  </div>
                  {/* 价格行情 */}
                  <div className="flex items-center justify-between mt-1.5 text-xs">
                    <span className="font-semibold text-slate-800">{signal.latestPrice.toFixed(2)}</span>
                    <span className={`font-bold ${signal.snapshot.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>{signal.snapshot.changePercent >= 0 ? '+' : ''}{signal.snapshot.changePercent.toFixed(2)}%</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-1 text-[10px] text-slate-400">
                    <div>开 <span className="text-slate-600">{formatPrice(signal.snapshot.open)}</span></div>
                    <div>收 <span className="text-slate-600">{signal.latestPrice.toFixed(2)}</span></div>
                    <div>高 <span className="text-red-500">{formatPrice(signal.snapshot.high)}</span></div>
                    <div>低 <span className="text-green-600">{formatPrice(signal.snapshot.low)}</span></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-1.5 text-xs text-slate-500">
                    <div>专家 {Math.round(signal.expert.consensus * 100)}%</div>
                    <div>技术 {signal.technical.total}</div>
                    <div>量化 {signal.quant.total}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
