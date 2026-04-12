/**
 * 专家记忆系统 — 管理专家的三层记忆、FactPool 摘要、专家画像
 *
 * 职责：
 * 1. buildFactPoolSummary: 从 FactPool 提取紧凑的文本摘要（注入 user message）
 * 2. buildExpertProfile: 从表现数据构建专家画像（注入 system message）
 * 3. buildMemoryContext: 组装专家的短/中/长期记忆文本（注入 user message）
 * 4. runDailyMemoryUpdate: 盘后更新记忆（写入当日条目、回填前日结果、LLM 压缩中期）
 */

import { logger } from '../../utils/logger'
import { saLog } from './sa-logger'
import { callProviderText } from './llm-provider-adapter'
import {
  readExpertDailyMemories,
  readExpertMemoryStore,
  readStockAnalysisQuoteCache,
  readStockAnalysisSignals,
  saveExpertDailyMemories,
  saveExpertMemoryStore,
  withFileLock,
  MAX_SHORT_TERM_DAYS,
} from './store'
import type {
  ExpertDailyMemoryEntry,
  ExpertLongTermMemory,
  ExpertMemory,
  ExpertMemoryStore,
  ExpertMidTermMemory,
  ExpertProfile,
  FactPool,
  FactPoolSummary,
  StockAnalysisAIConfig,
  StockAnalysisAIProvider,
  StockAnalysisExpertPerformanceData,
  StockAnalysisExpertPerformanceEntry,
  StockAnalysisSignal,
} from './types'

// ==================== FactPool 摘要 ====================

/** 从 FactPool 提取紧凑的文本摘要，用于注入专家 prompt（纯文本处理，零 LLM 成本） */
export function buildFactPoolSummary(factPool: FactPool): FactPoolSummary {
  const macroSummary = buildMacroSummary(factPool)
  const policySummary = buildPolicySummary(factPool)
  const announcementHighlights = buildAnnouncementHighlights(factPool)
  const industryHighlights = buildIndustryHighlights(factPool)
  const sentimentSummary = buildSentimentSummary(factPool)
  const globalMarketSummary = buildGlobalMarketSummary(factPool)
  const moneyFlowSummary = buildMoneyFlowSummary(factPool)

  return { macroSummary, policySummary, announcementHighlights, industryHighlights, sentimentSummary, globalMarketSummary, moneyFlowSummary }
}

function buildMacroSummary(factPool: FactPool): string | null {
  const m = factPool.macroData
  if (!m) return null

  const parts: string[] = []
  if (m.gdpGrowth !== null) parts.push(`GDP增速${m.gdpGrowth}%`)
  if (m.cpi !== null) parts.push(`CPI同比${m.cpi}%`)
  if (m.pmi !== null) parts.push(`PMI ${m.pmi}`)
  if (m.interestRate !== null) parts.push(`LPR ${m.interestRate}%`)
  if (m.exchangeRateUsdCny !== null) parts.push(`美元/人民币 ${m.exchangeRateUsdCny.toFixed(2)}`)
  if (m.treasuryYield10y !== null) parts.push(`10Y国债 ${m.treasuryYield10y.toFixed(2)}%`)

  return parts.length > 0 ? parts.join('，') : null
}

function buildPolicySummary(factPool: FactPool): string | null {
  const events = factPool.policyEvents
  if (events.length === 0) return null

  return events.slice(0, 3).map((e) => e.title).join('；')
}

function buildAnnouncementHighlights(factPool: FactPool): string[] {
  const items = factPool.companyAnnouncements
  if (items.length === 0) return []

  // 优先取 major 重要公告
  const major = items.filter((a) => a.importance === 'major')
  const selected = major.length > 0 ? major : items
  return selected.slice(0, 5).map((a) => `${a.name}: ${a.title}`)
}

function buildIndustryHighlights(factPool: FactPool): string[] {
  const items = factPool.industryNews
  if (items.length === 0) return []

  return items.slice(0, 5).map((n) => n.title)
}

function buildSentimentSummary(factPool: FactPool): string | null {
  const primarySnapshots = factPool.socialSentiment.filter((snapshot) => snapshot.sourceKind === 'primary_sentiment')
  const snapshots = primarySnapshots.length > 0 ? primarySnapshots : factPool.socialSentiment
  if (snapshots.length === 0) return null

  // 取平均牛熊比
  let totalBull = 0
  let totalBear = 0
  for (const s of snapshots) {
    totalBull += s.overallBullBearRatio.bull
    totalBear += s.overallBullBearRatio.bear
  }
  const avgBull = totalBull / snapshots.length
  const avgBear = totalBear / snapshots.length
  const ratio = avgBear > 0 ? (avgBull / avgBear).toFixed(1) : '∞'

  // 收集热门话题（去重，最多5个）
  const topicsSet = new Set<string>()
  for (const s of snapshots) {
    for (const topic of s.hotTopics.slice(0, 3)) {
      topicsSet.add(topic)
      if (topicsSet.size >= 5) break
    }
    if (topicsSet.size >= 5) break
  }

  const sentiment = avgBull > avgBear ? '偏乐观' : avgBull < avgBear ? '偏悲观' : '中性'
  const topicStr = topicsSet.size > 0 ? `，热门话题: ${[...topicsSet].join('、')}` : ''
  return `市场情绪${sentiment}，牛熊比 ${ratio}:1${topicStr}`
}

function buildGlobalMarketSummary(factPool: FactPool): string | null {
  const g = factPool.globalMarkets
  if (!g) return null

  const parts: string[] = []
  if (g.sp500Change !== null) parts.push(`标普500 ${formatChange(g.sp500Change)}`)
  if (g.nasdaqChange !== null) parts.push(`纳指 ${formatChange(g.nasdaqChange)}`)
  if (g.hsiChange !== null) parts.push(`恒指 ${formatChange(g.hsiChange)}`)
  if (g.a50FuturesChange !== null) parts.push(`A50期货 ${formatChange(g.a50FuturesChange)}`)
  if (g.crudeOilChange !== null) parts.push(`原油 ${formatChange(g.crudeOilChange)}`)
  if (g.goldChange !== null) parts.push(`黄金 ${formatChange(g.goldChange)}`)

  return parts.length > 0 ? parts.join('，') : null
}

/** [H5] 从 FactPool 提取资金流向/板块流向摘要 */
function buildMoneyFlowSummary(factPool: FactPool): string | null {
  const extras = factPool.priceVolumeExtras
  if (!extras) return null

  const parts: string[] = []

  // 个股资金净流入 TOP 3
  if (extras.moneyFlow.length > 0) {
    const top3 = extras.moneyFlow.slice(0, 3)
      .map((m) => `${m.name}(${m.mainNetInflow > 0 ? '+' : ''}${m.mainNetInflow.toFixed(0)}万)`)
      .join('、')
    parts.push(`主力净流入: ${top3}`)
  }

  // 板块资金流 TOP 3
  if (extras.sectorFlow.length > 0) {
    const top3 = extras.sectorFlow.slice(0, 3)
      .map((s) => `${s.sectorName}(${s.netInflow > 0 ? '+' : ''}${s.netInflow.toFixed(0)}万)`)
      .join('、')
    parts.push(`板块资金: ${top3}`)
  }

  // 龙虎榜
  if (extras.dragonTiger) {
    parts.push(`龙虎榜 ${extras.dragonTiger.stockCount} 只上榜`)
  }

  // 大宗交易
  if (extras.blockTrade) {
    parts.push(`大宗交易 ${extras.blockTrade.tradeCount} 笔`)
  }

  return parts.length > 0 ? parts.join('；') : null
}

function formatChange(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

/** 将 FactPoolSummary 格式化为可注入 prompt 的 Markdown 文本 */
export function formatFactPoolSummaryForPrompt(summary: FactPoolSummary): string {
  const lines: string[] = []

  if (summary.macroSummary) lines.push(`- 宏观: ${summary.macroSummary}`)
  if (summary.policySummary) lines.push(`- 政策: ${summary.policySummary}`)
  if (summary.announcementHighlights.length > 0) {
    lines.push(`- 公告: ${summary.announcementHighlights.join('；')}`)
  }
  if (summary.industryHighlights.length > 0) {
    lines.push(`- 行业: ${summary.industryHighlights.join('；')}`)
  }
  if (summary.sentimentSummary) lines.push(`- 舆情: ${summary.sentimentSummary}`)
  if (summary.globalMarketSummary) lines.push(`- 全球: ${summary.globalMarketSummary}`)
  if (summary.moneyFlowSummary) lines.push(`- 资金: ${summary.moneyFlowSummary}`)

  return lines.length > 0 ? lines.join('\n') : ''
}

// ==================== 专家画像 ====================

/** 从专家表现数据构建画像，用于注入 system prompt */
export function buildExpertProfile(
  entry: StockAnalysisExpertPerformanceEntry,
): ExpertProfile {
  const recentStreak = computeRecentStreak(entry.recentOutcomes.map((o) => o.correct))

  return {
    expertId: entry.expertId,
    expertName: entry.expertName,
    predictionCount: entry.predictionCount,
    winRate: entry.winRate,
    avgConfidence: entry.averageConfidence,
    calibration: entry.calibration,
    bestMarketRegime: null,  // TODO: 可在后续版本基于市场环境分组统计
    worstMarketRegime: null,
    recentStreak,
  }
}

function computeRecentStreak(outcomes: boolean[]): string {
  if (outcomes.length === 0) return '暂无预测记录'

  const recent = outcomes.slice(0, 10)
  let streak = 0
  const firstResult = recent[0]

  for (const result of recent) {
    if (result === firstResult) {
      streak++
    } else {
      break
    }
  }

  const total = recent.length
  const correct = recent.filter(Boolean).length

  if (streak >= 3) {
    return firstResult
      ? `最近${streak}次连续正确（近${total}次中${correct}次正确）`
      : `最近${streak}次连续错误（近${total}次中${correct}次正确）`
  }

  return `近${total}次预测中${correct}次正确`
}

/** 将专家画像格式化为可注入 prompt 的 Markdown 文本 */
export function formatExpertProfileForPrompt(profile: ExpertProfile): string {
  const lines: string[] = [
    `## 你的历史表现`,
    `- 预测次数: ${profile.predictionCount}，胜率: ${(profile.winRate * 100).toFixed(1)}%，校准度: ${profile.calibration.toFixed(2)}`,
  ]

  if (profile.bestMarketRegime) lines.push(`- 擅长: ${profile.bestMarketRegime}`)
  if (profile.worstMarketRegime) lines.push(`- 不足: ${profile.worstMarketRegime}`)
  lines.push(`- 近期: ${profile.recentStreak}`)

  return lines.join('\n')
}

// ==================== 记忆上下文构建 ====================

/** 组装专家的记忆上下文文本（注入 user message） */
export function buildMemoryContext(memory: ExpertMemory | undefined): string {
  if (!memory) return ''

  const sections: string[] = []

  // 短期记忆
  if (memory.shortTerm.entries.length > 0) {
    sections.push(formatShortTermMemory(memory.shortTerm.entries))
  }

  // 中期记忆
  if (memory.midTerm) {
    sections.push(formatMidTermMemory(memory.midTerm))
  }

  // 长期记忆
  if (memory.longTerm) {
    const ltLines: string[] = []
    if (memory.longTerm.lessons.length > 0) {
      ltLines.push(`## 长期教训`)
      for (const lesson of memory.longTerm.lessons.slice(0, 10)) {
        ltLines.push(`- ${lesson}`)
      }
    }
    if (memory.longTerm.strengths.length > 0) {
      ltLines.push(`## 擅长的市场环境`)
      for (const s of memory.longTerm.strengths.slice(0, 5)) {
        ltLines.push(`- ${s}`)
      }
    }
    if (memory.longTerm.weaknesses.length > 0) {
      ltLines.push(`## 不擅长的市场环境`)
      for (const w of memory.longTerm.weaknesses.slice(0, 5)) {
        ltLines.push(`- ${w}`)
      }
    }
    if (ltLines.length > 0) sections.push(ltLines.join('\n'))
  }

  return sections.join('\n\n')
}

function formatShortTermMemory(entries: ExpertDailyMemoryEntry[]): string {
  const lines: string[] = [`## 你的近期预测回顾（最近${entries.length}日）`]

  for (const e of entries) {
    const verdictText = e.verdict === 'bullish' ? '看多' : e.verdict === 'bearish' ? '看空' : '中性'
    let resultText = '待验证'
    if (e.actualReturnNextDay !== null && e.wasCorrect !== null) {
      const sign = e.actualReturnNextDay >= 0 ? '+' : ''
      resultText = `实际${sign}${e.actualReturnNextDay.toFixed(2)}% ${e.wasCorrect ? '✓' : '✗'}`
    }
    lines.push(`- ${e.tradeDate} [${e.code}]: ${verdictText}(信心${e.confidence}) → ${resultText}`)
  }

  return lines.join('\n')
}

function formatMidTermMemory(midTerm: ExpertMidTermMemory): string {
  const lines: string[] = [
    `## 中期总结（${midTerm.period.from} ~ ${midTerm.period.to}）`,
    `胜率 ${(midTerm.winRate * 100).toFixed(1)}%，平均信心 ${midTerm.avgConfidence.toFixed(0)}，倾向${midTerm.dominantVerdict === 'bullish' ? '看多' : midTerm.dominantVerdict === 'bearish' ? '看空' : '中性'}。`,
  ]

  if (midTerm.keyPatterns.length > 0) {
    lines.push(`关键规律: ${midTerm.keyPatterns.join('；')}`)
  }

  if (midTerm.summary) {
    lines.push(midTerm.summary)
  }

  return lines.join('\n')
}

// ==================== 盘后记忆更新 ====================

/**
 * 盘后记忆更新流程：
 * 1. 从当日信号提取专家投票，写入 daily-memories
 * 2. 回填前一日的 daily-memories（用当日收盘价计算实际收益）
 * 3. 更新 memory-store 的短期记忆
 * 4. 如果短期溢出 → 用 LLM 压缩为中期记忆
 */
export async function runDailyMemoryUpdate(
  stockAnalysisDir: string,
  tradeDate: string,
  previousTradeDate: string | null,
  aiConfig: StockAnalysisAIConfig,
): Promise<void> {
  const logTag = '[memory]'
  const startMs = Date.now()
  saLog.info('memory', `开始盘后记忆更新 tradeDate=${tradeDate} previousTradeDate=${previousTradeDate ?? 'null'}`)

  try {
    // Step 1: 从当日信号提取专家投票，写入 daily-memories
    const signals = await readStockAnalysisSignals(stockAnalysisDir, tradeDate)
    const todayEntries = extractMemoryEntriesFromSignals(signals, tradeDate)

    if (todayEntries.length > 0) {
      await saveExpertDailyMemories(stockAnalysisDir, tradeDate, todayEntries)
      logger.info(`${logTag} 写入 ${todayEntries.length} 条当日记忆条目 (${tradeDate})`, { module: 'StockAnalysis' })
    }

    // Step 2: 回填前一日结果
    if (previousTradeDate) {
      await backfillPreviousDayResults(stockAnalysisDir, previousTradeDate, signals)
    }

    // Step 3 & 4: 更新 memory-store（短期 + 中期压缩）
    await updateMemoryStore(stockAnalysisDir, tradeDate, aiConfig)

    const elapsedMs = Date.now() - startMs
    saLog.info('memory', `盘后记忆更新完成 tradeDate=${tradeDate} 当日条目=${todayEntries.length} 耗时=${elapsedMs}ms`)
    logger.info(`${logTag} 记忆更新完成 (${tradeDate})`, { module: 'StockAnalysis' })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '未知错误'
    const elapsedMs = Date.now() - startMs
    saLog.error('memory', `盘后记忆更新失败 tradeDate=${tradeDate} 耗时=${elapsedMs}ms 错误=${msg}`)
    logger.error(`${logTag} 记忆更新失败: ${msg}`, { module: 'StockAnalysis' })
    // 记忆更新失败不应阻断盘后流程，静默降级
  }
}

/** 从信号列表中提取所有专家的预测记录 */
function extractMemoryEntriesFromSignals(
  signals: StockAnalysisSignal[],
  tradeDate: string,
): ExpertDailyMemoryEntry[] {
  const entries: ExpertDailyMemoryEntry[] = []

  for (const signal of signals) {
    if (!signal.expert?.votes) continue

    for (const vote of signal.expert.votes) {
      // 跳过规则引擎和 fallback 的投票
      if (vote.modelId === 'rule-engine' || vote.usedFallback) continue

      entries.push({
        tradeDate,
        expertId: vote.expertId,
        code: signal.code,
        name: signal.name,
        verdict: vote.verdict,
        confidence: vote.confidence,
        reason: vote.reason,
        actualReturnNextDay: null,
        wasCorrect: null,
      })
    }
  }

  return entries
}

/** 回填前一日 daily-memories 的实际结果 */
async function backfillPreviousDayResults(
  stockAnalysisDir: string,
  previousTradeDate: string,
  todaySignals: StockAnalysisSignal[],
): Promise<void> {
  const prevEntries = await readExpertDailyMemories(stockAnalysisDir, previousTradeDate)
  if (prevEntries.length === 0) return

  // 构建今日价格涨跌表（用 signal 的 changePercent）
  const changeMap = new Map<string, number>()
  for (const signal of todaySignals) {
    changeMap.set(signal.code, signal.latestPrice !== 0 ? signal.snapshot.changePercent : 0)
  }

  // [L2] 补充 quote cache 中的股票涨跌数据，覆盖不在今日信号中的昨日预测股票
  const missingCodes = new Set<string>()
  for (const entry of prevEntries) {
    if (entry.actualReturnNextDay !== null) continue
    if (!changeMap.has(entry.code)) missingCodes.add(entry.code)
  }
  if (missingCodes.size > 0) {
    try {
      const quoteCache = await readStockAnalysisQuoteCache(stockAnalysisDir)
      if (quoteCache?.quotes) {
        for (const q of quoteCache.quotes) {
          if (missingCodes.has(q.code)) {
            changeMap.set(q.code, q.changePercent)
          }
        }
      }
      logger.info(`[memory] 从 quote cache 补充 ${missingCodes.size - [...missingCodes].filter(c => !changeMap.has(c)).length} 条回填数据`, { module: 'StockAnalysis' })
    } catch {
      // quote cache 不可用时静默降级，只用信号中的数据
    }
  }

  let updated = 0
  for (const entry of prevEntries) {
    if (entry.actualReturnNextDay !== null) continue // 已回填

    const actualReturn = changeMap.get(entry.code)
    if (actualReturn === undefined) continue

    entry.actualReturnNextDay = actualReturn
    // P2-C4: neutral 正确性阈值收紧 — 从 1% 改为 0.5%（A 股日均波动 1.5-2%，1% 太宽松导致 neutral 胜率虚高）
    entry.wasCorrect = (entry.verdict === 'bullish' && actualReturn > 0)
      || (entry.verdict === 'bearish' && actualReturn < 0)
      || (entry.verdict === 'neutral' && Math.abs(actualReturn) < 0.5)
    updated++
  }

  if (updated > 0) {
    await saveExpertDailyMemories(stockAnalysisDir, previousTradeDate, prevEntries)
    logger.info(`[memory] 回填 ${updated} 条前日记忆结果 (${previousTradeDate})`, { module: 'StockAnalysis' })
  }
}

/** 更新 memory-store：整合短期记忆，必要时 LLM 压缩中期 */
/** [P2-24] 记忆存储文件路径，用于 withFileLock 防止并发写入 */
function memoryStoreLockKey(stockAnalysisDir: string): string {
  return `${stockAnalysisDir}/experts/memory-store.json`
}

async function updateMemoryStore(
  stockAnalysisDir: string,
  tradeDate: string,
  aiConfig: StockAnalysisAIConfig,
): Promise<void> {
  // [P2-24] 用 withFileLock 保护 read-modify-write，防止并发调用时数据覆盖
  await withFileLock(memoryStoreLockKey(stockAnalysisDir), async () => {
  const store = await readExpertMemoryStore(stockAnalysisDir)

  // 加载最近 MAX_SHORT_TERM_DAYS+5 天的 daily memories（多加几天余量）
  const recentDates = getRecentTradeDates(tradeDate, MAX_SHORT_TERM_DAYS + 10)
  const allRecentEntries: ExpertDailyMemoryEntry[] = []

  for (const date of recentDates) {
    const entries = await readExpertDailyMemories(stockAnalysisDir, date)
    allRecentEntries.push(...entries)
  }

  // 按专家分组
  const entriesByExpert = new Map<string, ExpertDailyMemoryEntry[]>()
  for (const entry of allRecentEntries) {
    const existing = entriesByExpert.get(entry.expertId) ?? []
    existing.push(entry)
    entriesByExpert.set(entry.expertId, existing)
  }

  // 需要 LLM 压缩的专家（短期记忆溢出的）
  const needsCompression: Array<{ expertId: string; overflowEntries: ExpertDailyMemoryEntry[] }> = []

  // 更新每个专家的短期记忆
  for (const [expertId, entries] of entriesByExpert) {
    // 按日期降序排列（最新的在前）
    entries.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))

    // 按交易日截断而非固定条数（修复每天分析 >10 只股票时截断错误）
    const uniqueDates = [...new Set(entries.map((e) => e.tradeDate))].sort((a, b) => b.localeCompare(a))
    const keepDates = new Set(uniqueDates.slice(0, MAX_SHORT_TERM_DAYS))
    const shortTermEntries = entries.filter((e) => keepDates.has(e.tradeDate))
    const overflowEntries = entries.filter((e) => !keepDates.has(e.tradeDate))

    if (!store.memories[expertId]) {
      store.memories[expertId] = {
        expertId,
        shortTerm: { entries: [] },
        midTerm: null,
        longTerm: null,
        updatedAt: new Date().toISOString(),
      }
    }

    store.memories[expertId].shortTerm.entries = shortTermEntries
    store.memories[expertId].updatedAt = new Date().toISOString()

    if (overflowEntries.length > 0) {
      needsCompression.push({ expertId, overflowEntries })
    }
  }

  // LLM 压缩中期记忆（如果有溢出的条目）
  if (needsCompression.length > 0) {
    await compressMidTermMemories(store, needsCompression, aiConfig)
  }

  await saveExpertMemoryStore(stockAnalysisDir, store)
  }) // withFileLock end
}

/** 用 LLM 压缩溢出的短期记忆为中期摘要 */
async function compressMidTermMemories(
  store: ExpertMemoryStore,
  items: Array<{ expertId: string; overflowEntries: ExpertDailyMemoryEntry[] }>,
  aiConfig: StockAnalysisAIConfig,
): Promise<void> {
  // 找到所有可用的 LLM provider（用于 fallback 链）
  const providers = findAllAvailableProviders(aiConfig)
  if (providers.length === 0) {
    logger.warn('[memory] 无可用 LLM provider，跳过中期记忆压缩', { module: 'StockAnalysis' })
    // 回退为纯统计压缩
    for (const { expertId, overflowEntries } of items) {
      store.memories[expertId].midTerm = buildStatisticalMidTermMemory(
        overflowEntries,
        store.memories[expertId].midTerm,
      )
    }
    return
  }

  for (const { expertId, overflowEntries } of items) {
    try {
      const compressed = await compressSingleExpertMidTerm(
        expertId,
        overflowEntries,
        store.memories[expertId].midTerm,
        providers,
      )
      store.memories[expertId].midTerm = compressed
      logger.info(`[memory] 专家 ${expertId} 中期记忆已 LLM 压缩（${overflowEntries.length} 条 → 摘要）`, { module: 'StockAnalysis' })
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      logger.warn(`[memory] 专家 ${expertId} LLM 压缩失败，降级为统计压缩: ${msg}`, { module: 'StockAnalysis' })
      store.memories[expertId].midTerm = buildStatisticalMidTermMemory(
        overflowEntries,
        store.memories[expertId].midTerm,
      )
    }
  }
}

/** 纯统计方式构建中期记忆（LLM 不可用时的降级方案） */
function buildStatisticalMidTermMemory(
  entries: ExpertDailyMemoryEntry[],
  existing: ExpertMidTermMemory | null,
): ExpertMidTermMemory {
  const filledEntries = entries.filter((e) => e.wasCorrect !== null)
  const winCount = filledEntries.filter((e) => e.wasCorrect).length
  const winRate = filledEntries.length > 0 ? winCount / filledEntries.length : 0
  const avgConfidence = entries.length > 0
    ? entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length
    : 50

  const verdictCounts = { bullish: 0, bearish: 0, neutral: 0 }
  for (const e of entries) verdictCounts[e.verdict]++
  const dominantVerdict = verdictCounts.bullish >= verdictCounts.bearish && verdictCounts.bullish >= verdictCounts.neutral
    ? 'bullish' as const
    : verdictCounts.bearish >= verdictCounts.neutral
      ? 'bearish' as const
      : 'neutral' as const

  const dates = entries.map((e) => e.tradeDate).sort()
  const period = {
    from: existing?.period.from ?? dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
  }

  // 合并现有的 keyPatterns
  const keyPatterns = existing?.keyPatterns?.slice(0, 5) ?? []

  // [M12] 加权平均：基于样本量，避免多次压缩后回归 50%
  // P2-C3: 中期记忆衰减 — 旧数据样本量按 0.8 衰减因子缩减，确保近期数据权重更高
  const DECAY_FACTOR = 0.8
  const newSampleCount = filledEntries.length || entries.length
  const rawExistingCount = existing ? (existing.sampleCount ?? 1) : 0
  const existingSampleCount = Math.round(rawExistingCount * DECAY_FACTOR) // 衰减旧样本权重
  const totalSampleCount = existingSampleCount + newSampleCount

  const mergedWinRate = existing && existingSampleCount > 0
    ? (existing.winRate * existingSampleCount + winRate * newSampleCount) / totalSampleCount
    : winRate
  const mergedAvgConfidence = existing && existingSampleCount > 0
    ? (existing.avgConfidence * existingSampleCount + avgConfidence * newSampleCount) / totalSampleCount
    : avgConfidence

  return {
    summary: existing?.summary ?? '',
    period,
    winRate: mergedWinRate,
    avgConfidence: mergedAvgConfidence,
    dominantVerdict,
    keyPatterns,
    compressedAt: new Date().toISOString(),
    sampleCount: totalSampleCount,
  }
}

/** 使用 LLM 压缩单个专家的溢出记忆为中期摘要 */
async function compressSingleExpertMidTerm(
  expertId: string,
  overflowEntries: ExpertDailyMemoryEntry[],
  existingMidTerm: ExpertMidTermMemory | null,
  providers: Array<{ provider: StockAnalysisAIProvider; modelId: string }>,
): Promise<ExpertMidTermMemory> {
  const stats = buildStatisticalMidTermMemory(overflowEntries, existingMidTerm)

  // 构建 LLM 压缩 prompt
  const entrySummaries = overflowEntries.slice(0, 30).map((e) => {
    const verdictText = e.verdict === 'bullish' ? '看多' : e.verdict === 'bearish' ? '看空' : '中性'
    const resultText = e.wasCorrect !== null
      ? (e.wasCorrect ? '✓正确' : '✗错误')
      : '待验证'
    return `${e.tradeDate} [${e.code}] ${verdictText}(信心${e.confidence}): ${e.reason} → ${resultText}`
  }).join('\n')

  const existingContext = existingMidTerm?.summary
    ? `\n\n已有的中期记忆摘要（需要整合更新）：\n${existingMidTerm.summary}`
    : ''

  const systemMsg = '你是一个投资分析记忆压缩助手。请将以下预测记录压缩为简洁的中期记忆摘要。'

  const userMsg = [
    `专家 ID: ${expertId}`,
    `统计: 胜率 ${(stats.winRate * 100).toFixed(1)}%, 平均信心 ${stats.avgConfidence.toFixed(0)}, 主要倾向: ${stats.dominantVerdict}`,
    ``,
    `需要压缩的预测记录:`,
    entrySummaries,
    existingContext,
    ``,
    `请输出一段不超过 300 字的中文摘要，概括:`,
    `1. 这段时期的主要预测倾向和结果`,
    `2. 发现的规律和模式（如：什么情况下判断准确/失误）`,
    `3. 值得记住的关键教训`,
    ``,
    `同时请返回 2-5 条关键规律（keyPatterns），每条不超过 20 字。`,
    ``,
    `请严格按以下 JSON 格式返回:`,
    '```json',
    `{`,
    `  "summary": "摘要文本",`,
    `  "keyPatterns": ["规律1", "规律2"]`,
    `}`,
    '```',
  ].join('\n')

  const content = await callMemoryLLM(
    providers,
    [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg },
    ],
    `专家 ${expertId} 中期压缩`,
  )

  const parsed = parseCompressionResponse(content)

  return {
    summary: parsed.summary || stats.summary,
    period: stats.period,
    winRate: stats.winRate,
    avgConfidence: stats.avgConfidence,
    dominantVerdict: stats.dominantVerdict,
    keyPatterns: parsed.keyPatterns.length > 0 ? parsed.keyPatterns : stats.keyPatterns,
    compressedAt: new Date().toISOString(),
    sampleCount: stats.sampleCount,
  }
}

function parseCompressionResponse(content: string): { summary: string; keyPatterns: string[] } {
  // 尝试直接解析
  try {
    const raw = JSON.parse(content)
    return {
      summary: String(raw.summary ?? '').slice(0, 500),
      keyPatterns: Array.isArray(raw.keyPatterns) ? raw.keyPatterns.map(String).slice(0, 5) : [],
    }
  } catch {
    // 尝试从 code block 提取
  }

  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      const raw = JSON.parse(jsonMatch[1].trim())
      return {
        summary: String(raw.summary ?? '').slice(0, 500),
        keyPatterns: Array.isArray(raw.keyPatterns) ? raw.keyPatterns.map(String).slice(0, 5) : [],
      }
    } catch {
      // 继续
    }
  }

  // 兜底：整段作为 summary
  return { summary: content.slice(0, 500), keyPatterns: [] }
}

/** 从 aiConfig 找到第一个可用的 provider + model */
function findAvailableProvider(
  aiConfig: StockAnalysisAIConfig,
): { provider: StockAnalysisAIProvider; modelId: string } | null {
  const all = findAllAvailableProviders(aiConfig)
  return all.length > 0 ? all[0] : null
}

/** 从 aiConfig 找到所有可用的 provider + model（用于 fallback 链） */
function findAllAvailableProviders(
  aiConfig: StockAnalysisAIConfig,
): Array<{ provider: StockAnalysisAIProvider; modelId: string }> {
  const result: Array<{ provider: StockAnalysisAIProvider; modelId: string }> = []
  for (const provider of aiConfig.providers) {
    if (!provider.enabled || !provider.apiKey) continue
    if (provider.models.length > 0) {
      result.push({ provider, modelId: provider.models[0] })
    }
  }
  return result
}

/** 通用记忆 LLM 调用，支持多 provider fallback */
async function callMemoryLLM(
  providers: Array<{ provider: StockAnalysisAIProvider; modelId: string }>,
  messages: Array<{ role: string; content: string }>,
  label: string,
): Promise<string> {
  const systemMsg = messages.find((message) => message.role === 'system')?.content ?? ''
  const userMsg = messages.find((message) => message.role === 'user')?.content ?? ''

  for (let i = 0; i < providers.length; i++) {
    const { provider, modelId } = providers[i]
    try {
      const data = await callProviderText({
        provider,
        modelId,
        messages,
        // [P2-23] 确保 max_tokens 有最小值保障（至少 512），避免过小导致输出被截断
        maxTokens: Math.max(512, Math.min(provider.maxTokens ?? 2000, 4096)),
        temperature: 0.3,
        userAgent: 'ClawOS/StockAnalysis Memory',
        timeoutMs: 60_000,
      })
      const content = data.content.trim()
      if (!content) throw new Error('LLM 返回空内容')

      // 记录 LLM 调用全量日志
      saLog.llmCall({
        timestamp: new Date().toISOString(),
        module: 'memory',
        model: modelId,
        providerId: provider.id,
        agentName: label,
        prompt: { system: systemMsg, user: userMsg },
        response: content,
        latencyMs: data.latencyMs,
        tokens: data.usage ? {
          prompt: data.usage.prompt_tokens,
          completion: data.usage.completion_tokens,
          total: data.usage.total_tokens,
        } : undefined,
        success: true,
      })

      return content
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'

      // 记录失败的 LLM 调用日志
      saLog.llmCall({
        timestamp: new Date().toISOString(),
        module: 'memory',
        model: modelId,
        providerId: provider.id,
        agentName: label,
        prompt: { system: systemMsg, user: userMsg },
        response: null,
        latencyMs: 0,
        success: false,
        error: msg,
      })

      if (i < providers.length - 1) {
        logger.warn(`[memory] ${label} provider ${provider.name || modelId} 失败 (${msg})，尝试下一个`, { module: 'StockAnalysis' })
      } else {
        throw new Error(`所有 ${providers.length} 个 provider 均失败，最后错误: ${msg}`)
      }
    }
  }
  throw new Error('无可用 provider')
}

// 交易日历工具从 trading-calendar.ts 导入
import { getRecentTradeDates } from './trading-calendar.js'

// ==================== 长期记忆构建 ====================

/** 最少需要几次中期压缩才构建长期记忆 */
const MIN_MID_TERM_COMPRESSIONS_FOR_LONG_TERM = 1

/**
 * [H4] 月度长期记忆更新：遍历所有有中期记忆的专家，
 * 用 LLM 从中期记忆聚合出长期教训/优势/劣势；LLM 不可用时降级为纯统计提取。
 *
 * 调用时机：月报生成后（generateMonthlyReport）
 */
export async function runLongTermMemoryUpdate(
  stockAnalysisDir: string,
  aiConfig: StockAnalysisAIConfig,
): Promise<void> {
  const logTag = '[memory:long-term]'
  const startMs = Date.now()
  saLog.info('memory', '开始长期记忆更新')

  try {
    // [P2-24] 用 withFileLock 保护 read-modify-write
    await withFileLock(memoryStoreLockKey(stockAnalysisDir), async () => {
      const store = await readExpertMemoryStore(stockAnalysisDir)
      let updated = 0

      for (const [expertId, memory] of Object.entries(store.memories)) {
        if (!memory.midTerm) continue
        // 中期记忆需要至少被压缩过 1 次（有 compressedAt）才值得构建长期
        if (!memory.midTerm.compressedAt) continue

        try {
          const longTerm = await buildLongTermForExpert(
            expertId,
            memory,
            aiConfig,
          )
          if (longTerm) {
            store.memories[expertId].longTerm = longTerm
            store.memories[expertId].updatedAt = new Date().toISOString()
            updated++
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : '未知错误'
          logger.warn(`${logTag} 专家 ${expertId} 长期记忆构建失败: ${msg}`, { module: 'StockAnalysis' })
        }
      }

      if (updated > 0) {
        store.updatedAt = new Date().toISOString()
        await saveExpertMemoryStore(stockAnalysisDir, store)
        const elapsedMs = Date.now() - startMs
        saLog.info('memory', `长期记忆更新完成 更新专家数=${updated} 耗时=${elapsedMs}ms`)
        logger.info(`${logTag} 长期记忆已更新，${updated} 位专家`, { module: 'StockAnalysis' })
      } else {
        const elapsedMs = Date.now() - startMs
        saLog.info('memory', `长期记忆无需更新（无满足条件的专家） 耗时=${elapsedMs}ms`)
        logger.info(`${logTag} 无需更新长期记忆（无满足条件的专家）`, { module: 'StockAnalysis' })
      }
    }) // withFileLock end
  } catch (error) {
    const msg = error instanceof Error ? error.message : '未知错误'
    const elapsedMs = Date.now() - startMs
    saLog.error('memory', `长期记忆更新失败 耗时=${elapsedMs}ms 错误=${msg}`)
    logger.error(`${logTag} 长期记忆更新流程失败: ${msg}`, { module: 'StockAnalysis' })
    // 长期记忆更新失败不阻断月报流程
  }
}

/** 为单个专家构建/更新长期记忆 */
async function buildLongTermForExpert(
  expertId: string,
  memory: ExpertMemory,
  aiConfig: StockAnalysisAIConfig,
): Promise<ExpertLongTermMemory | null> {
  const midTerm = memory.midTerm
  if (!midTerm) return null

  const providers = findAllAvailableProviders(aiConfig)
  if (providers.length > 0) {
    return buildLongTermWithLLM(expertId, memory, providers)
  }

  // LLM 不可用 → 降级为纯统计提取
  return buildLongTermStatistical(expertId, memory)
}

/** LLM 方式构建长期记忆 */
async function buildLongTermWithLLM(
  expertId: string,
  memory: ExpertMemory,
  providers: Array<{ provider: StockAnalysisAIProvider; modelId: string }>,
): Promise<ExpertLongTermMemory> {
  const existing = memory.longTerm
  const midTerm = memory.midTerm!

  // 构建上下文
  const contextParts: string[] = [
    `专家 ID: ${expertId}`,
    `中期统计: 胜率 ${(midTerm.winRate * 100).toFixed(1)}%, 平均信心 ${midTerm.avgConfidence.toFixed(0)}, 主要倾向 ${midTerm.dominantVerdict}`,
    `时段: ${midTerm.period.from} ~ ${midTerm.period.to}`,
  ]

  if (midTerm.summary) {
    contextParts.push(`\n中期摘要:\n${midTerm.summary}`)
  }
  if (midTerm.keyPatterns.length > 0) {
    contextParts.push(`\n关键规律:\n${midTerm.keyPatterns.map((p) => `- ${p}`).join('\n')}`)
  }

  // 短期记忆中的近期表现
  const recentEntries = memory.shortTerm.entries.filter((e) => e.wasCorrect !== null)
  if (recentEntries.length > 0) {
    const recentWins = recentEntries.filter((e) => e.wasCorrect).length
    contextParts.push(`\n近期表现: ${recentEntries.length} 次预测中 ${recentWins} 次正确 (${(recentWins / recentEntries.length * 100).toFixed(1)}%)`)
  }

  if (existing) {
    contextParts.push(`\n已有长期记忆（需要整合更新）:`)
    if (existing.lessons.length > 0) contextParts.push(`教训: ${existing.lessons.join('；')}`)
    if (existing.strengths.length > 0) contextParts.push(`擅长: ${existing.strengths.join('；')}`)
    if (existing.weaknesses.length > 0) contextParts.push(`不足: ${existing.weaknesses.join('；')}`)
  }

  const systemMsg = '你是一个投资分析记忆系统。请从专家的中期记忆中提炼长期教训和市场环境偏好。'

  const userMsg = [
    ...contextParts,
    ``,
    `请提炼出以下内容:`,
    `1. lessons: 5-10条核心教训（每条不超过30字，如"放量突破后追涨胜率高"）`,
    `2. strengths: 2-5条擅长的市场环境（如"震荡市中低吸策略"）`,
    `3. weaknesses: 2-5条不擅长的市场环境（如"急跌行情中容易抄底过早"）`,
    ``,
    `请严格按以下 JSON 格式返回:`,
    '```json',
    `{`,
    `  "lessons": ["教训1", "教训2"],`,
    `  "strengths": ["擅长1", "擅长2"],`,
    `  "weaknesses": ["不足1", "不足2"]`,
    `}`,
    '```',
  ].join('\n')

  try {
    const content = await callMemoryLLM(
      providers,
      [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      `专家 ${expertId} 长期记忆`,
    )

    const parsed = parseLongTermResponse(content)

    // 与已有长期记忆合并去重
    return mergeLongTermMemory(existing, parsed)
  } catch (error) {
    logger.warn(`[memory:long-term] LLM 构建失败，降级为统计提取: ${error instanceof Error ? error.message : '未知错误'}`, { module: 'StockAnalysis' })
    return buildLongTermStatistical(expertId, memory)
  }
}

/** 解析 LLM 返回的长期记忆 JSON */
function parseLongTermResponse(content: string): ExpertLongTermMemory {
  const empty: ExpertLongTermMemory = { lessons: [], strengths: [], weaknesses: [], updatedAt: new Date().toISOString() }

  const tryParse = (text: string): ExpertLongTermMemory | null => {
    try {
      const raw = JSON.parse(text)
      return {
        lessons: Array.isArray(raw.lessons) ? raw.lessons.map(String).slice(0, 20) : [],
        strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String).slice(0, 10) : [],
        weaknesses: Array.isArray(raw.weaknesses) ? raw.weaknesses.map(String).slice(0, 10) : [],
        updatedAt: new Date().toISOString(),
      }
    } catch {
      return null
    }
  }

  // 尝试直接解析
  const direct = tryParse(content)
  if (direct) return direct

  // 尝试从 code block 提取
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    const extracted = tryParse(jsonMatch[1].trim())
    if (extracted) return extracted
  }

  return empty
}

/** 合并新旧长期记忆，去重，截断到上限 */
function mergeLongTermMemory(
  existing: ExpertLongTermMemory | null,
  incoming: ExpertLongTermMemory,
): ExpertLongTermMemory {
  if (!existing) return incoming

  const dedup = (arr: string[], max: number): string[] => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of arr) {
      const normalized = item.trim()
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized)
        result.push(normalized)
      }
      if (result.length >= max) break
    }
    return result
  }

  return {
    // 新的在前，旧的在后（LLM 已经整合了旧内容，但保底保留旧条目）
    lessons: dedup([...incoming.lessons, ...existing.lessons], 20),
    strengths: dedup([...incoming.strengths, ...existing.strengths], 10),
    weaknesses: dedup([...incoming.weaknesses, ...existing.weaknesses], 10),
    updatedAt: new Date().toISOString(),
  }
}

/** 纯统计方式构建长期记忆（LLM 不可用时的降级方案） */
function buildLongTermStatistical(
  expertId: string,
  memory: ExpertMemory,
): ExpertLongTermMemory {
  const existing = memory.longTerm
  const midTerm = memory.midTerm

  const lessons: string[] = existing?.lessons.slice(0, 15) ?? []
  const strengths: string[] = existing?.strengths.slice(0, 8) ?? []
  const weaknesses: string[] = existing?.weaknesses.slice(0, 8) ?? []

  // 从中期记忆的 keyPatterns 提取教训
  if (midTerm?.keyPatterns) {
    for (const pattern of midTerm.keyPatterns) {
      if (!lessons.includes(pattern)) {
        lessons.push(pattern)
      }
    }
  }

  // 从中期统计推断优势/劣势
  if (midTerm) {
    if (midTerm.winRate >= 0.6) {
      const note = `${midTerm.period.from}~${midTerm.period.to}期间胜率${(midTerm.winRate * 100).toFixed(0)}%`
      if (!strengths.some((s) => s.includes(midTerm.period.from))) {
        strengths.push(note)
      }
    } else if (midTerm.winRate < 0.4) {
      const note = `${midTerm.period.from}~${midTerm.period.to}期间胜率仅${(midTerm.winRate * 100).toFixed(0)}%`
      if (!weaknesses.some((w) => w.includes(midTerm.period.from))) {
        weaknesses.push(note)
      }
    }
  }

  return {
    lessons: lessons.slice(0, 20),
    strengths: strengths.slice(0, 10),
    weaknesses: weaknesses.slice(0, 10),
    updatedAt: new Date().toISOString(),
  }
}

// ==================== 导出测试用内部函数 ====================

export const _testing = {
  buildMacroSummary,
  buildPolicySummary,
  buildAnnouncementHighlights,
  buildIndustryHighlights,
  buildSentimentSummary,
  buildGlobalMarketSummary,
  buildMoneyFlowSummary,
  formatChange,
  computeRecentStreak,
  formatShortTermMemory,
  formatMidTermMemory,
  extractMemoryEntriesFromSignals,
  buildStatisticalMidTermMemory,
  getRecentTradeDates,
  parseCompressionResponse,
  parseLongTermResponse,
  mergeLongTermMemory,
  buildLongTermStatistical,
}
