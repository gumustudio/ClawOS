import {
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

import type { StockAnalysisOverview, StockAnalysisLearnedWeights, StockAnalysisThresholdAdjustment } from '../types'
import { buildBehaviorProfileSummary } from '../dashboardMeta'
import { formatPercent, percentTone, sentimentLabel } from '../utils'
import {
  AdviceCard,
  MetricCard,
  ProgressRow,
  Tag,
} from './shared'

function LearnedWeightsPanel({ weights }: { weights: StockAnalysisLearnedWeights }) {
  const acc = weights.dimensionAccuracy
  const adj = weights.adjustmentFactors
  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-3 shadow-sm">
      <h3 className="font-semibold text-slate-700 mb-2">学习权重调整 (Phase 4.1)</h3>
      <p className="text-xs text-slate-500 mb-2">基于 {weights.sampleCount} 笔复盘记录的维度准确性，自动调整融合权重</p>
      <div className="grid grid-cols-3 gap-3 text-sm mb-2">
        <MetricCard label="专家准确性" value={`${(acc.expert * 100).toFixed(1)}%`} />
        <MetricCard label="技术准确性" value={`${(acc.technical * 100).toFixed(1)}%`} />
        <MetricCard label="量化准确性" value={`${(acc.quant * 100).toFixed(1)}%`} />
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <MetricCard label="专家偏移" value={adj.expert > 0 ? `+${(adj.expert * 100).toFixed(1)}%` : `${(adj.expert * 100).toFixed(1)}%`} valueClassName={adj.expert > 0 ? 'text-emerald-600' : adj.expert < 0 ? 'text-red-500' : ''} />
        <MetricCard label="技术偏移" value={adj.technical > 0 ? `+${(adj.technical * 100).toFixed(1)}%` : `${(adj.technical * 100).toFixed(1)}%`} valueClassName={adj.technical > 0 ? 'text-emerald-600' : adj.technical < 0 ? 'text-red-500' : ''} />
        <MetricCard label="量化偏移" value={adj.quant > 0 ? `+${(adj.quant * 100).toFixed(1)}%` : `${(adj.quant * 100).toFixed(1)}%`} valueClassName={adj.quant > 0 ? 'text-emerald-600' : adj.quant < 0 ? 'text-red-500' : ''} />
      </div>
      <p className="text-xs text-slate-400 mt-2">更新于 {new Date(weights.updatedAt).toLocaleDateString('zh-CN')}</p>
    </div>
  )
}

function ThresholdHistoryPanel({ adjustments }: { adjustments: StockAnalysisThresholdAdjustment[] }) {
  if (adjustments.length === 0) return null
  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-3 shadow-sm">
      <h3 className="font-semibold text-slate-700 mb-2">Conviction 阈值自适应 (Phase 4.2)</h3>
      <div className="space-y-2 text-sm max-h-48 overflow-y-auto">
        {adjustments.slice(0, 10).map((entry, index) => (
          <div key={index} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs">{new Date(entry.timestamp).toLocaleDateString('zh-CN')}</span>
              <Tag text={entry.regime} tone={entry.adjustment < 0 ? 'green' : 'amber'} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-600">胜率 {(entry.recentWinRate * 100).toFixed(0)}%</span>
              <span className={entry.adjustment < 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                {entry.previousMinCompositeScore} → {entry.newMinCompositeScore}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProfileTab({ overview }: { overview: StockAnalysisOverview }) {
  const behavior = buildBehaviorProfileSummary(overview)
  const caution = overview.stats.winRate < 0.5 || overview.stats.maxDrawdown < -8
  return (
    <div className="space-y-3 relative h-full pb-20">
      {caution ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-3">
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <ExclamationTriangleIcon className="w-5 h-5" />
            <h2 className="text-base font-bold">系统提醒：当前策略处于谨慎期</h2>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">当前胜率或回撤指标不理想，建议减少主观加仓，优先遵守止损和观望纪律。</p>
        </div>
      ) : null}

      <h2 className="text-xl font-bold text-slate-800">行为画像与诊断</h2>

      <div className="grid grid-cols-3 gap-3">
        {/* 左列：执行画像 + 风险心境 */}
        <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-3 shadow-sm flex flex-col gap-3">
          <div>
            <h3 className="font-semibold text-slate-700 mb-2">策略执行画像</h3>
            <div className="space-y-2.5">
              <ProgressRow label="系统胜率" value={Math.round(overview.stats.winRate * 100)} colorClass="bg-red-500" />
              <ProgressRow label="执行率" value={Math.round(behavior.executionRate * 100)} colorClass="bg-indigo-500" />
              <ProgressRow label="忽略率" value={Math.round(behavior.ignoreRate * 100)} colorClass="bg-amber-500" />
              <ProgressRow label="推翻率" value={Math.round(behavior.rejectRate * 100)} colorClass="bg-slate-500" />
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100">
            <h3 className="font-semibold text-slate-700 mb-2">当前风险心境</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <MetricCard label="回撤压力" value={formatPercent(overview.stats.maxDrawdown)} valueClassName={percentTone(overview.stats.maxDrawdown)} />
              <MetricCard label="市场情绪" value={sentimentLabel(overview.marketState.sentiment)} />
              <MetricCard label="观望占比" value={`${Math.round(behavior.watchRate * 100)}%`} />
              <MetricCard label="纪律分" value={`${behavior.disciplineScore}/100`} />
            </div>
          </div>
        </div>

        {/* 中列：系统建议 */}
        <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-3 shadow-sm">
          <h3 className="font-semibold text-slate-700 mb-2">系统建议</h3>
          <div className="space-y-2 text-sm">
            <AdviceCard tone="red" title="止损纪律" content="任何个股跌破 -3% 硬止损位，优先执行而不是补仓。" />
            <AdviceCard tone="amber" title="集中持仓" content="只保留 1-3 只最强标的，避免被中等信号摊薄收益。" />
            <AdviceCard tone="green" title="观望并非失败" content="当最高分都不过线时，观望本身就是策略的一部分。" />
            <AdviceCard tone="amber" title="执行偏差复核" content={behavior.rejectRate > 0.3 || behavior.ignoreRate > 0.3 ? '近期推翻/忽略比例偏高，建议复核人为执行偏差。' : '近期用户执行偏差较低，可继续保持纪律。'} />
          </div>
        </div>

        {/* 右列：系统阶段 */}
        <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-3 shadow-sm">
          <h3 className="font-semibold text-slate-700 mb-2">系统阶段</h3>
          <div className="flex flex-wrap gap-2">
            <Tag text="中证500真实股票池" tone="green" />
            <Tag text="三流融合" tone="green" />
            <Tag text="Conviction Filter" tone="green" />
            <Tag text="周度绩效追踪" tone="green" />
            <Tag text="用户决策回写" tone="amber" />
            <Tag text="学习权重 4.1" tone={overview.learnedWeights ? 'green' : 'amber'} />
            <Tag text="阈值自适应 4.2" tone={overview.thresholdHistory && overview.thresholdHistory.length > 0 ? 'green' : 'amber'} />
            <Tag text="四维复盘 4.3" tone="green" />
          </div>
        </div>
      </div>

      {/* 底部面板：学习权重 + 阈值自适应 并排 */}
      <div className="grid grid-cols-2 gap-3">
        {overview.learnedWeights ? <LearnedWeightsPanel weights={overview.learnedWeights} /> : null}
        {overview.thresholdHistory && overview.thresholdHistory.length > 0 ? <ThresholdHistoryPanel adjustments={overview.thresholdHistory} /> : null}
      </div>
    </div>
  )
}
