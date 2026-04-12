import { type ReactNode, useEffect, useState } from 'react'

import { fetchAvailableDates, fetchDataCollection } from '../api'
import type {
  DataCollectionResponse,
  FactPool,
  LLMExtractionResult,
} from '../types'

/** Agent ID 翻译 */
function agentLabel(agentId: string): string {
  const map: Record<string, string> = {
    macro_economy: '宏观经济',
    policy_regulation: '政策法规',
    company_info: '上市公司',
    price_volume: '量价数据',
    industry_news: '行业新闻',
    social_sentiment: '社交情绪',
    global_markets: '全球市场',
    data_quality: '数据质量',
  }
  return map[agentId] ?? agentId
}

function getAgentMessageStyle(log: { agentId: string; successRate: number; dataPointCount: number; errors: string[] }) {
  if (log.errors.length === 0) {
    return null
  }

  const firstError = log.errors[0] ?? ''
  const isPartialAvailabilityNotice = log.dataPointCount > 0 && log.successRate >= 0.5
  const isGlobalFallbackNotice = log.agentId === 'global_markets'
    && log.successRate >= 0.5
    && (firstError.includes('无数据') || firstError.includes('缺失'))

  if (isGlobalFallbackNotice || isPartialAvailabilityNotice) {
    return { prefix: '提示', toneClass: 'text-slate-500' }
  }

  return { prefix: '错误', toneClass: 'text-red-600' }
}

/** 公告分类翻译 */
function announcementCategoryLabel(category: string): string {
  const map: Record<string, string> = {
    earnings: '财报',
    insider_trading: '内部交易',
    equity_change: '股权变动',
    litigation: '诉讼',
    other: '其他',
  }
  return map[category] ?? category
}

/** 政策分类翻译 */
function policyCategoryLabel(category: string): string {
  const map: Record<string, string> = {
    monetary_policy: '货币政策',
    regulatory: '监管',
    industry: '产业政策',
    fiscal: '财政政策',
    other: '其他',
  }
  return map[category] ?? category
}

export function DataCollectionTab() {
  const [dates, setDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [data, setData] = useState<DataCollectionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  // 初始化：加载有数据收集记录的可用日期
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const availableDates = await fetchAvailableDates('data-collection')
        if (cancelled) return
        setDates(availableDates)
        if (availableDates.length > 0) {
          setSelectedDate(availableDates[0])
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void init()
    return () => { cancelled = true }
  }, [])

  // 日期切换时加载数据
  useEffect(() => {
    if (!selectedDate) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchDataCollection(selectedDate)
        if (cancelled) return
        setData(result)
        setExpandedSection(null)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [selectedDate])

  if (loading && !data) {
    return <div className="h-full flex items-center justify-center text-slate-500">正在加载数据收集结果...</div>
  }

  const factPool = data?.factPool ?? null
  const llmExtraction = data?.llmExtraction ?? null

  return (
    <div className="space-y-3 pb-20">
      {/* 标题 + 日期选择器 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">AI 数据收集</h2>
        <div className="flex items-center gap-3">
          {loading && <span className="text-xs text-slate-400 animate-pulse">加载中...</span>}
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {dates.map((date) => (
              <option key={date} value={date}>{date}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* FactPool 概览 */}
          {factPool ? (
            <FactPoolPanel factPool={factPool} expandedSection={expandedSection} onToggle={setExpandedSection} />
          ) : (
            <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-6 shadow-sm text-center">
              <div className="text-sm text-slate-400">当日 FactPool 为空 — 盘后分析尚未运行</div>
              <div className="text-xs text-slate-400 mt-1">运行"盘后分析"后将自动采集 8 个 Agent 的数据</div>
            </div>
          )}

          {/* LLM 提取结果 */}
          {llmExtraction ? (
            <LLMExtractionPanel extraction={llmExtraction} />
          ) : (
            <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-6 shadow-sm text-center">
              <div className="text-sm text-slate-400">当日 LLM 提取结果为空</div>
              <div className="text-xs text-slate-400 mt-1">盘后分析运行后将自动调用 LLM 进行公告/新闻/情绪抽取</div>
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div className="text-center text-sm text-slate-400 py-12">暂无可用数据收集记录</div>
      )}
    </div>
  )
}

// ── FactPool 面板 ──────────────────────────────────────────

function FactPoolPanel({ factPool, expandedSection, onToggle }: {
  factPool: FactPool
  expandedSection: string | null
  onToggle: (section: string | null) => void
}) {
  const primarySocialSentiment = factPool.socialSentiment.filter((snapshot) => snapshot.sourceKind === 'primary_sentiment')
  const supplementarySocialSentiment = factPool.socialSentiment.filter((snapshot) => snapshot.sourceKind === 'supplementary_heat')
  const platformLabelMap: Record<string, string> = {
    xueqiu: '雪球',
    weibo: '微博',
    guba: '股吧/热榜',
    eastmoney_hot: '东方财富热榜',
  }

  return (
    <div className="space-y-3">
      {/* FactPool 概览卡片 */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="数据日期" value={factPool.tradeDate} />
        <SummaryCard label="更新时间" value={new Date(factPool.updatedAt).toLocaleString('zh-CN')} />
        <SummaryCard label="Agent 数量" value={String(factPool.agentLogs.length)} />
        <SummaryCard
          label="数据质量"
          value={factPool.dataQuality ? `${Math.round(factPool.dataQuality.overallScore)}分` : '未评估'}
        />
      </div>

      {/* Agent 执行摘要 */}
      {factPool.agentLogs.length > 0 && (
        <div className="bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700 text-sm">Agent 执行摘要</h3>
          </div>
          <div className="grid grid-cols-4 gap-3 p-4">
            {factPool.agentLogs.map((log) => (
              <div key={log.agentId} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700">{agentLabel(log.agentId)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${log.successRate >= 0.8 ? 'bg-green-100 text-green-700' : log.successRate >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {Math.round(log.successRate * 100)}%
                  </span>
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  <div>数据点: {log.dataPointCount}</div>
                  <div>耗时: {log.elapsedMs}ms</div>
                  {(() => {
                    const messageStyle = getAgentMessageStyle(log)
                    if (!messageStyle) return null
                    return (
                      <div className={`${messageStyle.toneClass} truncate`} title={log.errors.join('; ')}>
                        {messageStyle.prefix}: {log.errors[0]}
                      </div>
                    )
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 宏观经济 */}
      {factPool.macroData && (
        <CollapsibleSection
          title="宏观经济数据"
          expanded={expandedSection === 'macro'}
          onToggle={() => onToggle(expandedSection === 'macro' ? null : 'macro')}
        >
          <div className="grid grid-cols-3 gap-3 text-xs">
            <DataItem label="GDP 增速" value={factPool.macroData.gdpGrowth !== null ? `${factPool.macroData.gdpGrowth.toFixed(1)}%` : '无数据'} />
            <DataItem label="CPI" value={factPool.macroData.cpi !== null ? `${factPool.macroData.cpi.toFixed(1)}%` : '无数据'} />
            <DataItem label="PMI" value={factPool.macroData.pmi !== null ? `${factPool.macroData.pmi.toFixed(1)}` : '无数据'} />
            <DataItem label="利率" value={factPool.macroData.interestRate !== null ? `${factPool.macroData.interestRate.toFixed(2)}%` : '无数据'} />
            <DataItem label="美元/人民币" value={factPool.macroData.exchangeRateUsdCny !== null ? factPool.macroData.exchangeRateUsdCny.toFixed(4) : '无数据'} />
            <DataItem label="10Y国债收益率" value={factPool.macroData.treasuryYield10y !== null ? `${factPool.macroData.treasuryYield10y.toFixed(2)}%` : '无数据'} />
          </div>
        </CollapsibleSection>
      )}

      {/* 政策事件 */}
      {factPool.policyEvents.length > 0 && (
        <CollapsibleSection
          title={`政策事件（${factPool.policyEvents.length} 条）`}
          expanded={expandedSection === 'policy'}
          onToggle={() => onToggle(expandedSection === 'policy' ? null : 'policy')}
        >
          <div className="space-y-2">
            {factPool.policyEvents.map((event) => (
              <div key={event.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-slate-800">{event.title}</span>
                  <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px]">
                    {policyCategoryLabel(event.category)}
                  </span>
                </div>
                <div className="text-slate-500">来源: {event.source} | 发布: {event.publishedAt}</div>
                {event.affectedSectors.length > 0 && (
                  <div className="text-slate-500 mt-0.5">影响板块: {event.affectedSectors.join('、')}</div>
                )}
                {event.rawText && (
                  <div className="text-slate-600 mt-1 leading-relaxed line-clamp-2">{event.rawText}</div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 公司公告 */}
      {factPool.companyAnnouncements.length > 0 && (
        <CollapsibleSection
          title={`公司公告（${factPool.companyAnnouncements.length} 条）`}
          expanded={expandedSection === 'announcements'}
          onToggle={() => onToggle(expandedSection === 'announcements' ? null : 'announcements')}
        >
          <div className="space-y-2">
            {factPool.companyAnnouncements.map((ann, index) => (
              <div key={`${ann.code}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-slate-800">{ann.name}({ann.code})</span>
                  <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px]">
                    {announcementCategoryLabel(ann.category)}
                  </span>
                  {ann.importance === 'major' && (
                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px]">重大</span>
                  )}
                </div>
                <div className="text-slate-700">{ann.title}</div>
                {ann.rawText && (
                  <div className="text-slate-600 mt-1 leading-relaxed line-clamp-2">{ann.rawText}</div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 行业新闻 */}
      {factPool.industryNews.length > 0 && (
        <CollapsibleSection
          title={`行业新闻（${factPool.industryNews.length} 条）`}
          expanded={expandedSection === 'news'}
          onToggle={() => onToggle(expandedSection === 'news' ? null : 'news')}
        >
          <div className="space-y-2">
            {factPool.industryNews.map((news) => (
              <div key={news.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-slate-800">{news.title}</span>
                </div>
                <div className="text-slate-500">来源: {news.source} | 发布: {news.publishedAt}</div>
                {news.sectors.length > 0 && (
                  <div className="text-slate-500 mt-0.5">涉及板块: {news.sectors.join('、')}</div>
                )}
                {news.rawSummary && (
                  <div className="text-slate-600 mt-1 leading-relaxed line-clamp-2">{news.rawSummary}</div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 社交情绪 */}
      {factPool.socialSentiment.length > 0 && (
        <CollapsibleSection
          title={`社交情绪（${factPool.socialSentiment.length} 个快照）`}
          expanded={expandedSection === 'sentiment'}
          onToggle={() => onToggle(expandedSection === 'sentiment' ? null : 'sentiment')}
        >
          <div className="space-y-2">
            {primarySocialSentiment.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">主舆情源</div>
                {primarySocialSentiment.map((snap, index) => (
                  <div key={`${snap.platform}-${index}`} className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-2.5 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-800">{platformLabelMap[snap.platform] ?? snap.platform}</span>
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700">真实舆情</span>
                      <span className="text-slate-400">{snap.collectedAt}</span>
                    </div>
                    <div className="text-slate-600">{snap.summary}</div>
                    <div className="flex gap-3 text-slate-600 mt-1">
                      <span className="text-red-600">多 {Math.round(snap.overallBullBearRatio.bull * 100)}%</span>
                      <span className="text-green-600">空 {Math.round(snap.overallBullBearRatio.bear * 100)}%</span>
                      <span>中 {Math.round(snap.overallBullBearRatio.neutral * 100)}%</span>
                    </div>
                    {snap.hotTopics.length > 0 && (
                      <div className="text-slate-500 mt-1">热议: {snap.hotTopics.slice(0, 5).join('、')}</div>
                    )}
                    {snap.topMentionedStocks.length > 0 && (
                      <div className="text-slate-500 mt-0.5">
                        热门股: {snap.topMentionedStocks.slice(0, 5).map((s) => `${s.code}(${s.mentionCount})`).join('、')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {supplementarySocialSentiment.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">热榜补充</div>
                {supplementarySocialSentiment.map((snap, index) => (
                  <div key={`${snap.platform}-supplementary-${index}`} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-800">{platformLabelMap[snap.platform] ?? snap.platform}</span>
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">热点补充</span>
                      <span className="text-slate-400">{snap.collectedAt}</span>
                    </div>
                    <div className="text-slate-600">{snap.summary}</div>
                    <div className="flex gap-3 text-slate-600 mt-1">
                      <span className="text-red-600">多 {Math.round(snap.overallBullBearRatio.bull * 100)}%</span>
                      <span className="text-green-600">空 {Math.round(snap.overallBullBearRatio.bear * 100)}%</span>
                      <span>中 {Math.round(snap.overallBullBearRatio.neutral * 100)}%</span>
                    </div>
                    {snap.hotTopics.length > 0 && (
                      <div className="text-slate-500 mt-1">热议: {snap.hotTopics.slice(0, 5).join('、')}</div>
                    )}
                    {snap.topMentionedStocks.length > 0 && (
                      <div className="text-slate-500 mt-0.5">
                        热门股: {snap.topMentionedStocks.slice(0, 5).map((s) => `${s.code}(${s.mentionCount})`).join('、')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* 全球市场 */}
      {factPool.globalMarkets && (
        <CollapsibleSection
          title="全球市场快照"
          expanded={expandedSection === 'global'}
          onToggle={() => onToggle(expandedSection === 'global' ? null : 'global')}
        >
          <div className="grid grid-cols-4 gap-3 text-xs">
            <DataItem label="标普500" value={factPool.globalMarkets.sp500Change !== null ? `${factPool.globalMarkets.sp500Change > 0 ? '+' : ''}${factPool.globalMarkets.sp500Change.toFixed(2)}%` : '无数据'} />
            <DataItem label="纳斯达克" value={factPool.globalMarkets.nasdaqChange !== null ? `${factPool.globalMarkets.nasdaqChange > 0 ? '+' : ''}${factPool.globalMarkets.nasdaqChange.toFixed(2)}%` : '无数据'} />
            <DataItem label="恒生指数" value={factPool.globalMarkets.hsiChange !== null ? `${factPool.globalMarkets.hsiChange > 0 ? '+' : ''}${factPool.globalMarkets.hsiChange.toFixed(2)}%` : '无数据'} />
            <DataItem label="A50 期货" value={factPool.globalMarkets.a50FuturesChange !== null ? `${factPool.globalMarkets.a50FuturesChange > 0 ? '+' : ''}${factPool.globalMarkets.a50FuturesChange.toFixed(2)}%` : '无数据'} />
            <DataItem label="美元/人民币" value={factPool.globalMarkets.usdCnyRate !== null ? factPool.globalMarkets.usdCnyRate.toFixed(4) : '无数据'} />
            <DataItem label="原油" value={factPool.globalMarkets.crudeOilChange !== null ? `${factPool.globalMarkets.crudeOilChange > 0 ? '+' : ''}${factPool.globalMarkets.crudeOilChange.toFixed(2)}%` : '无数据'} />
            <DataItem label="黄金" value={factPool.globalMarkets.goldChange !== null ? `${factPool.globalMarkets.goldChange > 0 ? '+' : ''}${factPool.globalMarkets.goldChange.toFixed(2)}%` : '无数据'} />
            <DataItem label="美10Y国债" value={factPool.globalMarkets.us10yYieldChange !== null ? `${factPool.globalMarkets.us10yYieldChange > 0 ? '+' : ''}${factPool.globalMarkets.us10yYieldChange.toFixed(3)}%` : '无数据'} />
          </div>
        </CollapsibleSection>
      )}

      {/* 数据质量报告 */}
      {factPool.dataQuality && (
        <CollapsibleSection
          title={`数据质量报告（总分 ${Math.round(factPool.dataQuality.overallScore * 100)}）`}
          expanded={expandedSection === 'quality'}
          onToggle={() => onToggle(expandedSection === 'quality' ? null : 'quality')}
        >
          <div className="space-y-2">
            {factPool.dataQuality.agentResults.map((result) => (
              <div key={result.agentId} className="flex items-center gap-3 text-xs rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <span className="font-medium text-slate-700 w-24">{agentLabel(result.agentId)}</span>
                <span className={`px-1.5 py-0.5 rounded ${result.isComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {result.isComplete ? '完整' : '不完整'}
                </span>
                <span className="text-slate-500">可靠度 {Math.round(result.reliabilityScore * 100)}%</span>
                {result.missingFields.length > 0 && (
                  <span className="text-amber-600 truncate" title={result.missingFields.join(', ')}>
                    缺失: {result.missingFields.join(', ')}
                  </span>
                )}
                {result.anomalies.length > 0 && (
                  <span className="text-red-600 truncate" title={result.anomalies.join(', ')}>
                    异常: {result.anomalies[0]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}

// ── LLM 提取结果面板 ──────────────────────────────────────

function LLMExtractionPanel({ extraction }: { extraction: LLMExtractionResult }) {
  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-700 text-sm">
          LLM 提取结果
          <span className="ml-2 text-xs text-slate-400 font-normal">
            {new Date(extraction.extractedAt).toLocaleString('zh-CN')}
          </span>
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {/* LLM 调用日志 */}
        {extraction.llmCalls.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2">LLM 调用日志</div>
            <div className="grid grid-cols-3 gap-2">
              {extraction.llmCalls.map((call, index) => (
                <div key={`${call.agent}-${index}`} className={`rounded-lg border p-2.5 text-xs ${call.success ? 'border-green-100 bg-green-50/50' : 'border-red-100 bg-red-50/50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-700">{call.agent}</span>
                    <span className={call.success ? 'text-green-600' : 'text-red-600'}>
                      {call.success ? '成功' : '失败'}
                    </span>
                  </div>
                  <div className="text-slate-500">模型: {call.model} | 耗时: {call.latencyMs}ms</div>
                  {call.error && <div className="text-red-600 mt-0.5 truncate" title={call.error}>{call.error}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 公告事件 */}
        {extraction.announcements.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2">公告事件（{extraction.announcements.length} 条）</div>
            <div className="space-y-1.5">
              {extraction.announcements.map((ann, index) => (
                <div key={`ann-${index}`} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{ann.company}</span>
                    <span className="text-slate-500">{ann.eventType}</span>
                    <span className={`px-1 py-0.5 rounded ${ann.sentiment > 0 ? 'bg-red-100 text-red-700' : ann.sentiment < 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      情绪 {ann.sentiment > 0 ? '+' : ''}{ann.sentiment.toFixed(1)}
                    </span>
                    <span className="text-slate-500">信心 {Math.round(ann.confidence * 100)}%</span>
                  </div>
                  {ann.riskFlags.length > 0 && (
                    <div className="text-red-600 mt-1">风险标记: {ann.riskFlags.join('、')}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 新闻影响 */}
        {extraction.newsImpacts.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2">新闻影响（{extraction.newsImpacts.length} 条）</div>
            <div className="space-y-1.5">
              {extraction.newsImpacts.map((news, index) => (
                <div key={`news-${index}`} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{news.topic}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${news.impactDirection === '利好' ? 'bg-red-100 text-red-700' : news.impactDirection === '利空' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {news.impactDirection}
                    </span>
                    <span className="text-slate-500">{news.impactLevel}</span>
                  </div>
                  {news.affectedSectors.length > 0 && (
                    <div className="text-slate-500 mt-1">影响板块: {news.affectedSectors.join('、')}</div>
                  )}
                  {news.affectedStocks.length > 0 && (
                    <div className="text-slate-500 mt-0.5">影响个股: {news.affectedStocks.join('、')}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 情绪指数 */}
        {extraction.sentimentIndex && (
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2">情绪指数</div>
            <div className="grid grid-cols-4 gap-3 text-xs">
              <DataItem label="综合情绪" value={extraction.sentimentIndex.overallSentiment.toFixed(2)} />
              <DataItem label="看多比例" value={`${Math.round(extraction.sentimentIndex.bullRatio * 100)}%`} />
              <DataItem label="看空比例" value={`${Math.round(extraction.sentimentIndex.bearRatio * 100)}%`} />
              <DataItem label="24h 变化" value={`${extraction.sentimentIndex.sentimentChange24h > 0 ? '+' : ''}${extraction.sentimentIndex.sentimentChange24h.toFixed(2)}`} />
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <span>羊群效应: {extraction.sentimentIndex.herdingSignal === 'none' ? '无' : extraction.sentimentIndex.herdingSignal === 'moderate' ? '中等' : '极端'}</span>
              {extraction.sentimentIndex.hotTopics.length > 0 && (
                <span>| 热议: {extraction.sentimentIndex.hotTopics.slice(0, 5).join('、')}</span>
              )}
            </div>
          </div>
        )}

        {/* 全部为空的提示 */}
        {extraction.announcements.length === 0 && extraction.newsImpacts.length === 0 && !extraction.sentimentIndex && (
          <div className="text-center text-xs text-slate-400 py-4">LLM 提取结果为空</div>
        )}
      </div>
    </div>
  )
}

// ── 通用子组件 ──────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-xl p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-800">{value}</div>
    </div>
  )
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 border border-slate-100 p-2.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

function CollapsibleSection({ title, expanded, onToggle, children }: {
  title: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50/60 transition-colors"
      >
        <h3 className="font-semibold text-slate-700 text-sm">{title}</h3>
        <span className="text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}
