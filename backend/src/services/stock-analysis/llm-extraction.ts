/**
 * G3+M3 LLM 信息提取层 — 盘后批量调用
 *
 * 原则：LLM 不做预测，只做信息提取。
 *
 * 3 个提取 Agent：
 * 1. 公告解析器 — 从公司公告中提取结构化事件
 * 2. 新闻影响分析器 — 评估行业新闻的影响方向/程度
 * 3. 舆情情感分析器 — 量化社交媒体情绪指标
 *
 * 每个 Agent 支持独立模型配置 + 自动 fallback：
 * - 优先使用 per-agent 分配的模型
 * - 未分配时使用第一个可用 provider 的第一个模型
 * - 主模型调用失败时，自动遍历其他 provider + model 重试
 */

import { logger } from '../../utils/logger'
import { saLog } from './sa-logger'
import { callProviderText } from './llm-provider-adapter'
import type {
  AnnouncementEvent,
  FactPool,
  LLMExtractionAgentId,
  LLMExtractionResult,
  NewsImpactEvent,
  SentimentIndex,
  StockAnalysisAIConfig,
  StockAnalysisAIProvider,
} from './types'

const LLM_CALL_TIMEOUT_MS = 360_000
const AGENT_FALLBACK_BUDGET_MS = 15 * 60 * 1000
const UNSUPPORTED_CANDIDATES = new Set([
  'OpenCodeGo/MiMo-V2-Pro',
  'OpenCodeGo/GLM-5',
])

// ==================== 工具函数 ====================

function nowIso(): string {
  return new Date().toISOString()
}

/** 一个可尝试的 provider + model 组合 */
interface LLMCandidate {
  provider: StockAnalysisAIProvider
  modelId: string
}

function isUnsupportedCandidate(provider: StockAnalysisAIProvider, modelId: string): boolean {
  return UNSUPPORTED_CANDIDATES.has(`${provider.name}/${modelId}`)
}

/** 调用 OpenAI 兼容 API */
async function callLLMChat(
  provider: StockAnalysisAIProvider,
  modelId: string,
  systemMessage: string,
  userMessage: string,
): Promise<{ content: string; latencyMs: number }> {
  const data = await callProviderText({
    provider,
    modelId,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
    maxTokens: provider.maxTokens ?? 50_000,
    temperature: 0.2,
    userAgent: 'ClawOS/StockAnalysis LLM-Extraction',
    timeoutMs: LLM_CALL_TIMEOUT_MS,
  })
  let content = data.content ?? ''
  content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  return { content, latencyMs: data.latencyMs }
}

/** 括号平衡匹配提取第一个完整的 JSON 结构 */
function extractBalancedJson(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open)
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === open) depth++
    else if (ch === close) { depth--; if (depth === 0) return text.slice(start, i + 1) }
  }
  return null
}

/**
 * [P2-12] 从截断的 JSON 数组文本中尽量恢复完整的元素。
 * 逐个提取平衡的 {...} 子串并解析，跳过截断的不完整元素。
 */
function recoverArrayItems<T>(text: string): T[] {
  const items: T[] = []
  let pos = 0
  while (pos < text.length) {
    const start = text.indexOf('{', pos)
    if (start === -1) break
    const fragment = extractBalancedJson(text.slice(start), '{', '}')
    if (!fragment) break
    try {
      items.push(JSON.parse(fragment) as T)
    } catch {
      // 该元素无法解析，跳过
    }
    pos = start + fragment.length
  }
  return items
}

type JsonExtractionMode = 'object-first' | 'array-first'

/** 从 LLM 返回的文本中提取 JSON 数组/对象 */
function extractJsonFromText<T>(text: string, mode: JsonExtractionMode = 'array-first'): T | null {
  // 尝试提取 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : text

  // 使用括号平衡匹配提取第一个完整的 JSON 结构
  const candidate = mode === 'object-first'
    ? extractBalancedJson(jsonStr, '{', '}') ?? extractBalancedJson(jsonStr, '[', ']')
    : extractBalancedJson(jsonStr, '[', ']') ?? extractBalancedJson(jsonStr, '{', '}')

  if (!candidate) {
    // [P2-12] 完整的数组/对象提取失败（可能被截断），尝试逐元素恢复
    const recovered = recoverArrayItems<unknown>(jsonStr)
    if (recovered.length > 0) {
      logger.warn(`[llm-extraction] JSON 整体解析失败，逐元素恢复了 ${recovered.length} 条`)
      return recovered as T
    }
    return null
  }

  try {
    return JSON.parse(candidate) as T
  } catch {
    // [P2-12] 平衡匹配成功但 JSON.parse 失败（可能内部截断），尝试逐元素恢复
    const recovered = recoverArrayItems<unknown>(candidate)
    if (recovered.length > 0) {
      logger.warn(`[llm-extraction] JSON 解析失败，逐元素恢复了 ${recovered.length} 条`, { text: candidate.slice(0, 200) })
      return recovered as T
    }
    logger.warn('[llm-extraction] JSON 解析失败，无法恢复', { text: candidate.slice(0, 200) })
    return null
  }
}

// ==================== 模型选择 + Fallback ====================

/**
 * 为指定提取 Agent 选择主候选模型：
 * 1. 优先使用 per-agent 分配的模型（如果对应 provider 仍启用）
 * 2. 否则使用第一个可用 provider 的第一个模型
 */
function pickPrimaryCandidate(
  agentId: LLMExtractionAgentId,
  aiConfig: StockAnalysisAIConfig,
): LLMCandidate | null {
  const agentConfig = aiConfig.extractionAgents?.find((a) => a.agentId === agentId)

  // 优先使用 per-agent 分配的模型
  if (agentConfig?.assignedModel) {
    const ref = agentConfig.assignedModel
    const provider = aiConfig.providers.find(
      (p) => p.id === ref.providerId && p.enabled && p.baseUrl && p.apiKey,
    )
    if (provider && provider.models.includes(ref.modelId) && !isUnsupportedCandidate(provider, ref.modelId)) {
      return { provider, modelId: ref.modelId }
    }
    logger.warn(`[llm-extraction] Agent ${agentId} 分配的模型 ${ref.modelId} 不可用，将使用 fallback`)
  }

  // 回退：取第一个可用 provider 的第一个模型
  for (const provider of aiConfig.providers) {
    if (!provider.enabled || !provider.baseUrl || !provider.apiKey) continue
    if (provider.models.length > 0) {
      const firstSupportedModel = provider.models.find((modelId) => !isUnsupportedCandidate(provider, modelId))
      if (firstSupportedModel) {
        return { provider, modelId: firstSupportedModel }
      }
    }
  }
  return null
}

/**
 * 构建 fallback 候选列表：收集所有 enabled provider 的全部 model，
 * 排除当前主候选，作为兜底重试池。
 */
function buildFallbackCandidates(
  aiConfig: StockAnalysisAIConfig,
  excludeProviderId: string,
  excludeModelId: string,
): LLMCandidate[] {
  const candidates: LLMCandidate[] = []
  for (const provider of aiConfig.providers) {
    if (!provider.enabled || !provider.baseUrl || !provider.apiKey) continue
    for (const modelId of provider.models) {
      if (provider.id === excludeProviderId && modelId === excludeModelId) continue
      if (isUnsupportedCandidate(provider, modelId)) {
        saLog.warn('LLM-Extraction', `跳过已知不支持候选: ${provider.name}/${modelId}`)
        continue
      }
      candidates.push({ provider, modelId })
    }
  }
  return candidates
}

type CallLog = LLMExtractionResult['llmCalls'][number]

/**
 * 带 fallback 的 LLM 调用封装：
 * 先尝试主候选，失败后依次尝试 fallback 候选列表中的其他 provider + model。
 * 全部失败才返回最终的错误日志。
 */
async function callWithFallback<T>(
  agentId: string,
  primary: LLMCandidate,
  fallbacks: LLMCandidate[],
  callFn: (provider: StockAnalysisAIProvider, modelId: string) => Promise<{ result: T; callLog: CallLog }>,
  emptyResult: T,
): Promise<{ result: T; callLog: CallLog }> {
  const allCandidates = [primary, ...fallbacks]
  const startedAt = Date.now()

  for (let i = 0; i < allCandidates.length; i++) {
    if (Date.now() - startedAt >= AGENT_FALLBACK_BUDGET_MS) {
      logger.error(`[llm-extraction] Agent ${agentId} fallback 总预算超时（${AGENT_FALLBACK_BUDGET_MS}ms）`)
      saLog.error('LLM-Extraction', `Agent ${agentId} fallback 总预算超时（${AGENT_FALLBACK_BUDGET_MS}ms），停止后续候选重试`)
      break
    }

    const candidate = allCandidates[i]
    const label = i === 0
      ? `[primary: ${candidate.provider.name}/${candidate.modelId}]`
      : `[fallback ${i}/${allCandidates.length - 1}: ${candidate.provider.name}/${candidate.modelId}]`

    try {
      const outcome = await callFn(candidate.provider, candidate.modelId)
      if (outcome.callLog.success) {
        if (i > 0) {
          logger.info(`[llm-extraction] Agent ${agentId} ${label} fallback 成功`)
        }
        saLog.info('LLM-Extraction', `Agent ${agentId} ${label} 成功: latency=${outcome.callLog.latencyMs}ms`)
        return outcome
      }
      // callLog.success === false 但没 throw（不应出现，但做防御）
      logger.warn(`[llm-extraction] Agent ${agentId} ${label} 返回失败，尝试下一个候选`)
      saLog.warn('LLM-Extraction', `Agent ${agentId} ${label} 返回失败（解析异常），尝试下一个候选`)
    } catch (error) {
      const errMsg = (error as Error).message
      logger.warn(`[llm-extraction] Agent ${agentId} ${label} 调用失败: ${errMsg}，尝试下一个候选`)
      saLog.warn('LLM-Extraction', `Agent ${agentId} ${label} 调用失败: ${errMsg}`)

      // 记录失败的 LLM 调用日志
      saLog.llmCall({
        timestamp: new Date().toISOString(),
        module: 'extraction',
        model: candidate.modelId,
        providerId: candidate.provider.id,
        agentName: agentId,
        prompt: { system: '', user: '' },
        response: null,
        latencyMs: 0,
        success: false,
        error: errMsg,
      })
    }
  }

  // 全部失败
  const lastCandidate = allCandidates[allCandidates.length - 1]
  logger.error(`[llm-extraction] Agent ${agentId} 所有候选模型均失败（共 ${allCandidates.length} 个）`)
  saLog.error('LLM-Extraction', `Agent ${agentId} 所有 ${allCandidates.length} 个候选模型均失败`)
  return {
    result: emptyResult,
    callLog: {
      agent: agentId,
      model: lastCandidate.modelId,
      latencyMs: 0,
      success: false,
      error: `所有 ${allCandidates.length} 个候选模型均失败`,
    },
  }
}

// ==================== Agent 1: 公告解析器 ====================

const ANNOUNCEMENT_SYSTEM_PROMPT = `你是一位专业的上市公司公告解析专家。你的任务是从公告标题和摘要中提取结构化事件信息。

你必须输出一个 JSON 数组，每个元素包含：
- company: 股票代码（如 "600519"）或公司名称
- eventType: 事件类型（如 "业绩预增"、"股东减持"、"重大合同"、"分红派息"、"增发配股"、"诉讼仲裁"、"高管变动" 等）
- magnitude: 影响程度描述（"大幅超预期"、"符合预期"、"低于预期"、"重大变更" 等）
- sentiment: 情绪分数 -1.0 到 1.0（正面=正值，负面=负值）
- keyMetrics: 关键指标字典（如 {"revenue_growth": 0.35}），没有则为空对象 {}
- riskFlags: 风险标记数组（如 ["应收账款增长较快"]），没有则为空数组 []
- confidence: 置信度 0-1

只输出 JSON，不要添加其他文本。如果没有有意义的公告，输出空数组 []。`

async function doExtractAnnouncements(
  factPool: FactPool,
  provider: StockAnalysisAIProvider,
  modelId: string,
): Promise<{ result: AnnouncementEvent[]; callLog: CallLog }> {
  const agentName = 'announcement_parser'

  if (factPool.companyAnnouncements.length === 0) {
    return {
      result: [],
      callLog: { agent: agentName, model: modelId, latencyMs: 0, success: true, error: null },
    }
  }

  // [P2-13] 截取后使用实际数量，避免 prompt 说"100条"但实际只传 30 条
  const slicedAnnouncements = factPool.companyAnnouncements.slice(0, 30)
  const announcementText = slicedAnnouncements
    .map((a, i) => `${i + 1}. [${a.code || '未知'}] ${a.name}: ${a.title} (${a.publishedAt})`)
    .join('\n')

  const userMsg = `请分析以下 ${slicedAnnouncements.length} 条上市公司公告，提取结构化事件：\n\n${announcementText}`
  const { content, latencyMs } = await callLLMChat(
    provider, modelId,
    ANNOUNCEMENT_SYSTEM_PROMPT,
    userMsg,
  )

  // 记录 LLM 调用全量日志
  saLog.llmCall({
    timestamp: new Date().toISOString(),
    module: 'extraction',
    model: modelId,
    providerId: provider.id,
    agentName,
    prompt: { system: ANNOUNCEMENT_SYSTEM_PROMPT, user: userMsg },
    response: content,
    latencyMs,
    success: true,
  })

  const parsed = extractJsonFromText<AnnouncementEvent[]>(content, 'array-first')
  // [P2-15] 校验全部 7 个字段，丢弃不完整的记录而非静默保留
  const announcements = (parsed ?? []).filter((item): item is AnnouncementEvent =>
    typeof item.company === 'string' && item.company.length > 0
    && typeof item.eventType === 'string' && item.eventType.length > 0
    && typeof item.magnitude === 'string'
    && typeof item.sentiment === 'number' && item.sentiment >= -1 && item.sentiment <= 1
    && typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1
    && (item.keyMetrics == null || typeof item.keyMetrics === 'object')
    && (item.riskFlags == null || Array.isArray(item.riskFlags)),
  ).map((item) => ({
    ...item,
    // 确保可选字段有合理默认值
    keyMetrics: item.keyMetrics ?? {},
    riskFlags: Array.isArray(item.riskFlags) ? item.riskFlags : [],
  }))

  // P2-B2: 区分"调用成功有数据"和"调用成功但解析为空"
  const parseSuccess = announcements.length > 0 || (parsed !== null && parsed.length === 0)
  return {
    result: announcements,
    callLog: {
      agent: agentName, model: modelId, latencyMs,
      success: parseSuccess,
      error: !parseSuccess ? `LLM 返回内容无法解析为有效公告（原始长度=${content.length}）` : null,
    },
  }
}

// ==================== Agent 2: 新闻影响分析器 ====================

const NEWS_IMPACT_SYSTEM_PROMPT = `你是一位专业的行业新闻影响分析师。你的任务是评估新闻的市场影响。

你必须输出一个 JSON 数组，每个元素包含：
- topic: 新闻主题
- impactDirection: "利好" | "利空" | "中性"
- impactLevel: "重大" | "中等" | "轻微"
- affectedSectors: 受影响行业数组（如 ["新能源汽车", "锂电池"]）
- affectedStocks: 可能受影响的股票代码数组（如 ["300750"]），不确定则为空数组
- timeHorizon: "短期" | "中期" | "长期"
- confidence: 置信度 0-1

只输出 JSON，不要添加其他文本。如果没有有意义的新闻，输出空数组 []。`

async function doExtractNewsImpact(
  factPool: FactPool,
  provider: StockAnalysisAIProvider,
  modelId: string,
): Promise<{ result: NewsImpactEvent[]; callLog: CallLog }> {
  const agentName = 'news_impact_analyzer'

  const allNews = [
    ...factPool.policyEvents.map((e) => `[政策] ${e.title}: ${e.rawText.slice(0, 200)}`),
    ...factPool.industryNews.map((n) => `[行业] ${n.title}: ${n.rawSummary.slice(0, 200)}`),
  ]

  if (allNews.length === 0) {
    return {
      result: [],
      callLog: { agent: agentName, model: modelId, latencyMs: 0, success: true, error: null },
    }
  }

  // [P2-13] 截取后使用实际数量
  const slicedNews = allNews.slice(0, 30)
  const newsText = slicedNews.map((n, i) => `${i + 1}. ${n}`).join('\n')

  const userMsg = `请分析以下 ${slicedNews.length} 条新闻的市场影响：\n\n${newsText}`
  const { content, latencyMs } = await callLLMChat(
    provider, modelId,
    NEWS_IMPACT_SYSTEM_PROMPT,
    userMsg,
  )

  // 记录 LLM 调用全量日志
  saLog.llmCall({
    timestamp: new Date().toISOString(),
    module: 'extraction',
    model: modelId,
    providerId: provider.id,
    agentName,
    prompt: { system: NEWS_IMPACT_SYSTEM_PROMPT, user: userMsg },
    response: content,
    latencyMs,
    success: true,
  })

  const parsed = extractJsonFromText<NewsImpactEvent[]>(content, 'array-first')
  const newsImpacts = (parsed ?? []).filter((item) =>
    typeof item.topic === 'string'
    && ['利好', '利空', '中性'].includes(item.impactDirection)
    && typeof item.confidence === 'number',
  )

  // P2-B2: 区分调用成功和解析失败
  const newsParseSuccess = newsImpacts.length > 0 || (parsed !== null && parsed.length === 0)
  return {
    result: newsImpacts,
    callLog: {
      agent: agentName, model: modelId, latencyMs,
      success: newsParseSuccess,
      error: !newsParseSuccess ? `LLM 返回内容无法解析为有效新闻影响（原始长度=${content.length}）` : null,
    },
  }
}

// ==================== Agent 3: 舆情情感分析器 ====================

const SENTIMENT_SYSTEM_PROMPT = `你是一位社交媒体舆情分析专家。你的任务是从热门话题和讨论中量化市场情绪。

你必须输出一个 JSON 对象，包含：
- overallSentiment: 总体情绪分数 -1.0 到 1.0
- bullRatio: 看多比例 0-1
- bearRatio: 看空比例 0-1
- neutralRatio: 中性比例 0-1（三者之和应为 1.0）
- hotTopics: 热门话题数组（最多 10 个）
- sentimentChange24h: 24小时情绪变化 -1.0 到 1.0
- herdingSignal: "none" | "moderate" | "extreme"（羊群效应信号）

只输出 JSON 对象，不要添加其他文本。`

async function doExtractSentiment(
  factPool: FactPool,
  provider: StockAnalysisAIProvider,
  modelId: string,
): Promise<{ result: SentimentIndex | null; callLog: CallLog }> {
  const agentName = 'sentiment_analyzer'

  if (factPool.socialSentiment.length === 0) {
    return {
      result: null,
      callLog: { agent: agentName, model: modelId, latencyMs: 0, success: true, error: null },
    }
  }

  const sentimentText = factPool.socialSentiment
    .map((s) => `[${s.platform}/${s.sourceKind}] ${s.summary}; 热门话题: ${s.hotTopics.join(', ')}; 多空比: 多${s.overallBullBearRatio.bull}/空${s.overallBullBearRatio.bear}/中${s.overallBullBearRatio.neutral}`)
    .join('\n')

  const userMsg = `请分析以下社交媒体数据的市场情绪：\n\n${sentimentText}`
  const { content, latencyMs } = await callLLMChat(
    provider, modelId,
    SENTIMENT_SYSTEM_PROMPT,
    userMsg,
  )

  // 记录 LLM 调用全量日志
  saLog.llmCall({
    timestamp: new Date().toISOString(),
    module: 'extraction',
    model: modelId,
    providerId: provider.id,
    agentName,
    prompt: { system: SENTIMENT_SYSTEM_PROMPT, user: userMsg },
    response: content,
    latencyMs,
    success: true,
  })

  const parsed = extractJsonFromText<SentimentIndex>(content, 'object-first')
  let sentimentIndex: SentimentIndex | null = null
  if (parsed && typeof parsed.overallSentiment === 'number') {
    let bull = typeof parsed.bullRatio === 'number' ? parsed.bullRatio : 0.5
    let bear = typeof parsed.bearRatio === 'number' ? parsed.bearRatio : 0.3
    let neutral = typeof parsed.neutralRatio === 'number' ? parsed.neutralRatio : 0.2
    // [P2-14] 归一化三个 ratio 使和为 1.0
    const total = bull + bear + neutral
    if (total > 0 && Math.abs(total - 1.0) > 0.001) {
      bull /= total
      bear /= total
      neutral /= total
    }
    sentimentIndex = {
      overallSentiment: Math.max(-1, Math.min(1, parsed.overallSentiment)),
      bullRatio: bull,
      bearRatio: bear,
      neutralRatio: neutral,
      hotTopics: Array.isArray(parsed.hotTopics) ? parsed.hotTopics : [],
      sentimentChange24h: typeof parsed.sentimentChange24h === 'number' ? Math.max(-1, Math.min(1, parsed.sentimentChange24h)) : 0,
      herdingSignal: ['none', 'moderate', 'extreme'].includes(parsed.herdingSignal as string) ? parsed.herdingSignal as SentimentIndex['herdingSignal'] : 'none',
    }
  }

  // P2-B2: 区分调用成功和解析失败
  const sentimentParseSuccess = sentimentIndex !== null
  return {
    result: sentimentIndex,
    callLog: {
      agent: agentName, model: modelId, latencyMs,
      success: sentimentParseSuccess,
      error: !sentimentParseSuccess ? `LLM 返回内容无法解析为有效情感指数（原始长度=${content.length}）` : null,
    },
  }
}

// ==================== 入口函数 ====================

/**
 * 运行 LLM 信息提取（3 个 Agent 并行调用，各自独立模型 + fallback）。
 *
 * 每个 Agent 的模型选择逻辑：
 * 1. 优先使用 per-agent 配置的模型（extractionAgents 中的 assignedModel）
 * 2. 未配置时使用第一个可用 provider 的第一个模型
 * 3. 主模型调用失败时，自动 fallback 到其他 provider + model
 *
 * 如果 AI 配置不可用（无 provider），则静默返回空结果。
 */
export async function runLLMExtraction(
  _stockAnalysisDir: string,
  factPool: FactPool,
  aiConfig: StockAnalysisAIConfig,
): Promise<LLMExtractionResult> {
  // 检查是否有任何可用 provider
  const hasAnyProvider = aiConfig.providers.some(
    (p) => p.enabled && p.baseUrl && p.apiKey && p.models.length > 0,
  )
  if (!hasAnyProvider) {
    logger.warn('[llm-extraction] 无可用 AI provider，跳过 LLM 信息提取')
    saLog.warn('LLM-Extraction', '无可用 AI provider，跳过 LLM 信息提取')
    return {
      extractedAt: nowIso(),
      tradeDate: factPool.tradeDate,
      announcements: [],
      newsImpacts: [],
      sentimentIndex: null,
      llmCalls: [],
    }
  }

  /** 为单个 Agent 运行带 fallback 的提取 */
  async function runAgentWithFallback<T>(
    agentId: LLMExtractionAgentId,
    callFn: (provider: StockAnalysisAIProvider, modelId: string) => Promise<{ result: T; callLog: CallLog }>,
    emptyResult: T,
  ): Promise<{ result: T; callLog: CallLog }> {
    const agentConfig = aiConfig.extractionAgents?.find((a) => a.agentId === agentId)
    if (agentConfig && !agentConfig.enabled) {
      logger.info(`[llm-extraction] Agent ${agentId} 已禁用，跳过`)
      return {
        result: emptyResult,
        callLog: { agent: agentId, model: 'disabled', latencyMs: 0, success: true, error: null },
      }
    }

    const primary = pickPrimaryCandidate(agentId, aiConfig)
    if (!primary) {
      logger.warn(`[llm-extraction] Agent ${agentId} 无可用模型`)
      return {
        result: emptyResult,
        callLog: { agent: agentId, model: 'none', latencyMs: 0, success: false, error: '无可用模型' },
      }
    }

    const fallbacks = buildFallbackCandidates(aiConfig, primary.provider.id, primary.modelId)
    logger.info(
      `[llm-extraction] Agent ${agentId}: 主模型 ${primary.provider.name}/${primary.modelId}`
      + (fallbacks.length > 0 ? `，备选 ${fallbacks.length} 个` : ''),
      { module: 'StockAnalysis' },
    )

    return callWithFallback(agentId, primary, fallbacks, callFn, emptyResult)
  }

  const extractionStart = Date.now()
  saLog.info('LLM-Extraction', `提取开始: tradeDate=${factPool.tradeDate} 公告=${factPool.companyAnnouncements.length} 政策=${factPool.policyEvents.length} 行业新闻=${factPool.industryNews.length} 舆情=${factPool.socialSentiment.length}`)

  // 3 个提取 Agent 并行运行，各自独立 fallback
  const [annResult, newsResult, sentResult] = await Promise.all([
    runAgentWithFallback(
      'announcement_parser',
      (provider, modelId) => doExtractAnnouncements(factPool, provider, modelId),
      [] as AnnouncementEvent[],
    ),
    runAgentWithFallback(
      'news_impact_analyzer',
      (provider, modelId) => doExtractNewsImpact(factPool, provider, modelId),
      [] as NewsImpactEvent[],
    ),
    runAgentWithFallback(
      'sentiment_analyzer',
      (provider, modelId) => doExtractSentiment(factPool, provider, modelId),
      null as SentimentIndex | null,
    ),
  ])

  const result: LLMExtractionResult = {
    extractedAt: nowIso(),
    tradeDate: factPool.tradeDate,
    announcements: annResult.result,
    newsImpacts: newsResult.result,
    sentimentIndex: sentResult.result,
    llmCalls: [annResult.callLog, newsResult.callLog, sentResult.callLog],
  }

  const successCount = result.llmCalls.filter((c) => c.success).length
  const extractionElapsed = Date.now() - extractionStart
  logger.info(`[llm-extraction] LLM 提取完成: ${successCount}/3 成功, 公告事件 ${result.announcements.length}, 新闻影响 ${result.newsImpacts.length}`)
  saLog.info('LLM-Extraction', `提取完成: 耗时=${extractionElapsed}ms 成功=${successCount}/3 公告事件=${result.announcements.length} 新闻影响=${result.newsImpacts.length} 舆情=${result.sentimentIndex ? '有' : '无'}`)

  return result
}

export const _testing = {
  extractJsonFromText,
  pickPrimaryCandidate,
  buildFallbackCandidates,
  isUnsupportedCandidate,
  AGENT_FALLBACK_BUDGET_MS,
  LLM_CALL_TIMEOUT_MS,
}
