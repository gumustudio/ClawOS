import type { StockAnalysisOverview, StockAnalysisStrategyConfig } from '../types'
import {
  buildCumulativeReturnChartData,
  buildDrawdownChartData,
  buildWeeklyDashboardSummary,
  buildWeeklyReturnChartData,
  buildWinRateChartData,
  formatModelGroupLabel,
  watchOutcomeLabel,
} from '../dashboardMeta'
import { formatPercent, getHoldingDaysFromOpenedAt, percentTone } from '../utils'
import { MiniBarChart, MiniLineChart } from './MiniChart'

/* ── 紧凑型指标卡片 ── */
function KPICell({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="px-3 py-2 min-w-0">
      <div className="text-[11px] text-slate-400 leading-tight truncate">{label}</div>
      <div className={`text-sm font-bold leading-snug mt-0.5 ${valueClass ?? 'text-slate-800'}`}>{value}</div>
      {sub ? <div className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">{sub}</div> : null}
    </div>
  )
}

/* ── 紧凑行 ── */
function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-[3px]">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-medium ${valueClass ?? 'text-slate-700'}`}>{value}</span>
    </div>
  )
}

export function MemoryTab({ overview, config }: { overview: StockAnalysisOverview; config: StockAnalysisStrategyConfig | null }) {
  const wd = buildWeeklyDashboardSummary(overview, config)
  const monthlySummary = Array.isArray((overview as unknown as { monthlySummary?: unknown }).monthlySummary)
    ? (overview as unknown as { monthlySummary: typeof overview.monthlySummary }).monthlySummary
    : []

  const cumulativeReturnData = buildCumulativeReturnChartData(overview)
  const drawdownData = buildDrawdownChartData(overview)
  const winRateData = buildWinRateChartData(overview)
  const weeklyReturnData = buildWeeklyReturnChartData(overview)
  const hasChartData = cumulativeReturnData.length >= 2

  function tradeTimeSummary(trade: typeof overview.recentTrades[number]) {
    if (trade.action === 'buy') {
      const buyAt = trade.buyDate ?? trade.tradeDate
      return `${new Date(buyAt).toLocaleDateString('zh-CN')}`
    }
    const buyAt = trade.buyDate ? new Date(trade.buyDate).toLocaleDateString('zh-CN') : '?'
    const sellAt = trade.sellDate ?? trade.tradeDate
    return `${buyAt} → ${new Date(sellAt).toLocaleDateString('zh-CN')}`
  }

  function tradeHoldingDays(trade: typeof overview.recentTrades[number]) {
    const buyAt = trade.buyDate ?? trade.tradeDate
    const endAt = trade.sellDate ?? trade.tradeDate
    return getHoldingDaysFromOpenedAt(buyAt, new Date(endAt))
  }

  const latestWeek = overview.weeklySummary[0]

  return (
    <div className="space-y-2 pb-16">
      {/* ── 标题 + KPI 条带 ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">记忆与复盘</h2>
        {latestWeek ? <span className="text-xs text-slate-400">最新周报: {latestWeek.weekLabel}</span> : null}
      </div>

      <div className="bg-white/70 border border-slate-200/60 rounded-xl shadow-sm flex divide-x divide-slate-100">
        <KPICell label="累计收益" value={formatPercent(wd.cumulativeReturn)} valueClass={percentTone(wd.cumulativeReturn)} />
        <KPICell label="胜率" value={`${Math.round(wd.winRate * 100)}%`} />
        <KPICell label="盈亏比" value={wd.profitLossRatio > 0 ? `${wd.profitLossRatio.toFixed(2)}:1` : '—'} />
        <KPICell label="夏普替代" value={wd.sharpeLike.toFixed(2)} />
        <KPICell label="最大回撤" value={formatPercent(wd.maxDrawdown)} valueClass={percentTone(wd.maxDrawdown)} />
        <KPICell label="观望准确率" value={`${Math.round(wd.watchAccuracy * 100)}%`} />
        {wd.overrideCount > 0 ? (
          <KPICell
            label="主观判断"
            value={`${wd.overrideCount}笔`}
            sub={wd.overrideWinRate !== null ? `${Math.round(wd.overrideWinRate * 100)}%胜率` : undefined}
          />
        ) : null}
      </div>

      {/* ── 主体：左 3/5 + 右 2/5 ── */}
      <div className="grid grid-cols-5 gap-2">
        {/* ─── 左列 ─── */}
        <div className="col-span-3 space-y-2">
          {/* 周度绩效 + 预警建议 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/70 border border-slate-200/60 rounded-xl p-2.5 shadow-sm">
              <h4 className="text-xs font-semibold text-slate-600 mb-1.5">周度绩效</h4>
              <Row label="本周交易" value={`${wd.tradeCount} 笔`} />
              <Row label="本周观望" value={`${wd.watchDays} 天`} />
              <Row label="周收益" value={formatPercent(wd.weeklyReturn)} valueClass={percentTone(wd.weeklyReturn)} />
              <Row label="累计收益" value={formatPercent(wd.cumulativeReturn)} valueClass={percentTone(wd.cumulativeReturn)} />
              <Row label="最大回撤" value={formatPercent(wd.maxDrawdown)} valueClass={percentTone(wd.maxDrawdown)} />
              <Row label="最佳模型组" value={wd.bestGroup ?? '—'} />
              <Row label="最弱模型组" value={wd.worstGroup ?? '—'} />
              {wd.overrideCount > 0 ? (
                <Row label="主观均收" value={wd.overrideAvgReturn !== null ? formatPercent(wd.overrideAvgReturn) : '—'} valueClass={wd.overrideAvgReturn !== null ? percentTone(wd.overrideAvgReturn) : undefined} />
              ) : null}
            </div>

            <div className="bg-white/70 border border-slate-200/60 rounded-xl p-2.5 shadow-sm flex flex-col gap-2">
              <div>
                <h4 className="text-xs font-semibold text-amber-600 mb-1">预警</h4>
                <div className="text-xs text-slate-600 space-y-0.5">
                  {wd.alerts.length > 0 ? wd.alerts.map((a) => <p key={a} className="leading-snug">· {a}</p>) : <p className="text-slate-400">无预警</p>}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-indigo-600 mb-1">建议调参</h4>
                <div className="text-xs text-slate-600 space-y-0.5">
                  {wd.tuningSuggestions.length > 0 ? wd.tuningSuggestions.map((s) => <p key={s} className="leading-snug">· {s}</p>) : <p className="text-slate-400">无需调参</p>}
                </div>
              </div>
            </div>
          </div>

          {/* 绩效图表 2x2 */}
          {hasChartData ? (
            <div className="grid grid-cols-2 gap-2">
              <MiniLineChart data={cumulativeReturnData} title="累计收益" strokeColor="#4f46e5" fillColor="rgba(79,70,229,0.08)" showZeroLine />
              <MiniLineChart data={drawdownData} title="最大回撤" strokeColor="#ef4444" fillColor="rgba(239,68,68,0.08)" showZeroLine />
              <MiniLineChart data={winRateData} title="胜率趋势" strokeColor="#10b981" fillColor="rgba(16,185,129,0.08)" formatValue={(v) => `${v.toFixed(0)}%`} />
              <MiniBarChart data={weeklyReturnData} title="每周收益" positiveColor="#ef4444" negativeColor="#22c55e" />
            </div>
          ) : null}
        </div>

        {/* ─── 右列 ─── */}
        <div className="col-span-2 space-y-2">
          {/* 最新周报卡片 */}
          {latestWeek ? (
            <div className="bg-indigo-600 text-white rounded-xl p-2.5 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-semibold opacity-80">最新周报</h4>
                <span className="text-sm font-bold">{latestWeek.weekLabel}</span>
              </div>
              <div className="flex gap-4 text-xs opacity-80">
                <span>收益 <strong className="text-white">{formatPercent(latestWeek.weeklyReturn)}</strong></span>
                <span>胜率 <strong className="text-white">{Math.round(latestWeek.winRate * 100)}%</strong></span>
                <span>交易 <strong className="text-white">{latestWeek.tradeCount}笔</strong></span>
              </div>
            </div>
          ) : null}

          {/* 月度汇总 */}
          <div className="bg-white/70 border border-slate-200/60 rounded-xl p-2.5 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1.5">月度汇总</h4>
            {monthlySummary.length > 0 ? (
              <div className="space-y-1">
                {monthlySummary.slice(0, 4).map((m) => (
                  <div key={m.monthLabel} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-b-0">
                    <div>
                      <span className="text-xs font-medium text-slate-700">{m.monthLabel}</span>
                      <span className="text-[10px] text-slate-400 ml-1.5">{m.tradeCount}笔 · 观望{m.watchDays}天</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-bold ${percentTone(m.monthlyReturn)}`}>{formatPercent(m.monthlyReturn)}</span>
                      <span className="text-[10px] text-slate-400 ml-1.5">累{formatPercent(m.cumulativeReturn)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-slate-400">暂无月度数据</p>}
          </div>

          {/* 最近交易 */}
          <div className="bg-white/70 border border-slate-200/60 rounded-xl p-2.5 shadow-sm">
            <h4 className="text-xs font-semibold text-slate-600 mb-1.5">最近交易</h4>
            {overview.recentTrades.length > 0 ? (
              <div className="space-y-1 max-h-[260px] overflow-y-auto">
                {overview.recentTrades.map((trade) => (
                  <div key={trade.id} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-b-0 gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${trade.action === 'buy' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                          {trade.action === 'buy' ? '买' : '卖'}
                        </span>
                        <span className="text-xs font-medium text-slate-800 truncate">{trade.name}</span>
                        <span className="text-[10px] text-slate-400">{trade.code}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {tradeTimeSummary(trade)} · {trade.quantity}股 · {tradeHoldingDays(trade)}天
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-medium text-slate-700">{trade.price.toFixed(2)}</div>
                      {typeof trade.pnlPercent === 'number' ? (
                        <div className={`text-[10px] font-bold ${percentTone(trade.pnlPercent)}`}>{formatPercent(trade.pnlPercent)}</div>
                      ) : (
                        <div className="text-[10px] text-slate-400">{Math.round(trade.weight * 100)}%仓</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-slate-400">暂无交易</p>}
          </div>
        </div>
      </div>

      {/* ── 底部：模型组 + 观望日志 并排 ── */}
      <div className="grid grid-cols-5 gap-2">
        {/* 模型组表现 */}
        <div className="col-span-3 bg-white/70 border border-slate-200/60 rounded-xl p-2.5 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-1.5">
            模型组表现
            {overview.modelGroupPerformance.every((g) => g.isSimulated) ? (
              <span className="text-[10px] text-amber-500 font-normal ml-1.5">（规则引擎统计）</span>
            ) : null}
          </h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-slate-400 uppercase">
                <th className="text-left py-1 font-medium">模型组</th>
                <th className="text-right py-1 font-medium">预测</th>
                <th className="text-right py-1 font-medium">胜率</th>
                <th className="text-right py-1 font-medium">校准</th>
                <th className="text-right py-1 font-medium">权重</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {overview.modelGroupPerformance.map((g) => (
                <tr key={g.group}>
                  <td className="py-1 text-slate-700 font-medium">{formatModelGroupLabel(g.group)}</td>
                  <td className="py-1 text-right text-slate-500">{g.predictionCount}</td>
                  <td className="py-1 text-right font-bold text-red-600">{Math.round(g.winRate * 100)}%</td>
                  <td className="py-1 text-right text-slate-500">{g.calibration.toFixed(2)}</td>
                  <td className="py-1 text-right text-slate-500">
                    {g.weight.toFixed(2)}
                    {g.isSimulated ? <span className="text-[9px] text-amber-500 ml-0.5">规</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 观望日志 */}
        <div className="col-span-2 bg-white/70 border border-slate-200/60 rounded-xl p-2.5 shadow-sm">
          <h4 className="text-xs font-semibold text-slate-600 mb-1.5">观望日志</h4>
          {overview.watchLogs.length > 0 ? (
            <div className="space-y-1.5">
              {overview.watchLogs.slice(0, 5).map((item) => (
                <div key={item.id} className="border-b border-slate-50 last:border-b-0 pb-1.5 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">{item.tradeDate}</span>
                    <span className="text-[10px] text-slate-400">最高 {item.highestSignalScore}分</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-snug line-clamp-2">{item.reason}</p>
                  <div className="flex gap-2 mt-0.5 text-[10px] text-slate-400">
                    <span>T+1: {typeof item.tPlus1Return === 'number' ? formatPercent(item.tPlus1Return) : '—'}</span>
                    <span>T+5: {typeof item.tPlus5Return === 'number' ? formatPercent(item.tPlus5Return) : '—'}</span>
                    <span className="font-medium">{watchOutcomeLabel(item.outcome)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-400">暂无观望记录</p>}
        </div>
      </div>
    </div>
  )
}
