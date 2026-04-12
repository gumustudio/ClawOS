/**
 * LLM 推理引擎 — 封装 OpenAI 兼容 API 调用、prompt 构造、响应解析
 *
 * 职责：
 * 1. 为每个 LLM 专家构造分析层专属的 prompt
 * 2. 批量并发调用 LLM API，收集投票结果
 * 3. 解析 LLM 返回的 JSON 结构化响应
 * 4. 返回聚合后的专家评分
 */

import { logger } from '../../utils/logger'
import { saLog } from './sa-logger'
import type { LLMCallLogEntry } from './sa-logger'
import {
  buildMemoryContext,
  formatExpertProfileForPrompt,
  formatFactPoolSummaryForPrompt,
} from './memory'
import { callProviderText } from './llm-provider-adapter'
import type {
  ExpertMemoryStore,
  ExpertProfile,
  FactPoolSummary,
  StockAnalysisAIConfig,
  StockAnalysisAIProvider,
  StockAnalysisExpertDefinition,
  StockAnalysisExpertLayer,
  StockAnalysisExpertStance,
  StockAnalysisMarketState,
  StockAnalysisStockSnapshot,
} from './types'

const UNSUPPORTED_CANDIDATES = new Set([
  'OpenCodeGo/MiMo-V2-Pro',
  'OpenCodeGo/GLM-5',
])

function isUnsupportedCandidate(provider: StockAnalysisAIProvider, modelId: string): boolean {
  return UNSUPPORTED_CANDIDATES.has(`${provider.name}/${modelId}`)
}

// ==================== 类型定义 ====================

/** 单个专家的 LLM 投票结果 */
export interface ExpertVote {
  expertId: string
  expertName: string
  layer: StockAnalysisExpertLayer
  stance: StockAnalysisExpertStance
  /** LLM 返回的判断：看多/看空/中性 */
  verdict: 'bullish' | 'bearish' | 'neutral'
  /** LLM 返回的置信度 0-100 */
  confidence: number
  /** LLM 给出的一句话理由 */
  reason: string
  /** 使用的模型 ID */
  modelId: string
  /** 是否使用了回退（LLM 调用失败时降级为规则推断） */
  usedFallback: boolean
  /** 响应延迟 (ms) */
  latencyMs: number
}

/** 聚合后的专家评分（替代原 buildExpertScore 的输出） */
export interface LLMExpertScore {
  bullishCount: number
  bearishCount: number
  neutralCount: number
  consensus: number
  score: number
  highlights: string[]
  risks: string[]
  /** 各专家的详细投票（供调试和前端展示） */
  votes: ExpertVote[]
  /** 成功调用 LLM 的专家数（主模型 + fallback LLM 都算成功） */
  llmSuccessCount: number
  /** 使用 fallback LLM 模型成功的专家数（主模型失败但其他 LLM 接管） */
  llmFallbackCount: number
  /** 完全降级为规则引擎推断的专家数（所有 LLM 候选均失败） */
  ruleFallbackCount: number
  /** @deprecated 向后兼容：等于 llmFallbackCount + ruleFallbackCount */
  fallbackCount: number
  /** 是否全部为模拟数据（零 LLM 调用成功，全部为规则引擎） */
  isSimulated: boolean
  /** [L4] 降级比例 0-1：仅基于规则引擎降级计算。0 = 无规则降级，1 = 全部规则降级 */
  degradeRatio: number
}

// ==================== Prompt 构造 ====================

/** 分析层的 prompt 模板 */
const LAYER_PROMPTS: Record<Exclude<StockAnalysisExpertLayer, 'rule_functions'>, string> = {
  industry_chain: '你是一位产业链分析专家。请从上下游供需关系、行业景气度、产业政策等角度分析该股票。',
  company_fundamentals: '你是一位公司基本面分析专家。请从盈利能力、财务健康度、竞争优势、管理层质量等角度分析该股票。',
  sell_side_research: '你是一位卖方研究员。请从估值水平、盈利预测、目标价位、行业比较等角度分析该股票。',
  world_power: '你是一位地缘政治与世界格局分析专家。请从国际关系、贸易政策、地缘冲突对 A 股市场和该行业的影响角度分析。',
  global_macro: '你是一位全球宏观经济分析专家。请从货币政策、通胀预期、经济增长、利率走势等角度分析对该股票的影响。',
  risk_governance: '你是一位风控与治理分析专家。请从公司治理风险、合规风险、信息披露质量、股权质押等角度分析该股票的风险。',
  sentiment: '你是一位市场情绪分析专家。请从市场情绪、资金流向、投资者行为、恐慌/贪婪指数等角度分析该股票的短期走势。',
  market_trading: '你是一位市场交易分析专家。请从技术形态、量价关系、筹码分布、主力资金动向等角度分析该股票。',
  buy_side: '你是一位买方机构投资经理。请从组合配置、风险收益比、持仓周期、资金管理等角度评估是否值得买入该股票。',
}

/** 立场引导文本 */
const STANCE_GUIDE: Record<StockAnalysisExpertStance, string> = {
  bullish: '你的分析倾向偏乐观（看多），但必须基于事实做出诚实判断，如果数据明确看空也应该如实表达。',
  bearish: '你的分析倾向偏谨慎（看空），但必须基于事实做出诚实判断，如果数据明确看多也应该如实表达。',
  neutral: '你保持完全中立的立场，纯粹基于数据和事实做出判断。',
}

/**
 * 数据维度分区定义，用于按 infoSubset 过滤传给 LLM 的上下文信息。
 * 每个维度返回该分区的 markdown 文本行数组。
 */
function getDataSections(
  snapshot: StockAnalysisStockSnapshot,
  marketState: StockAnalysisMarketState,
): Record<string, string[]> {
  return {
    basic: [
      `- 代码：${snapshot.code}，名称：${snapshot.name}，板块：${snapshot.sector}`,
      `- 最新价：${snapshot.latestPrice}，涨跌幅：${snapshot.changePercent}%`,
      `- 换手率：${snapshot.turnoverRate}%，总市值：${(snapshot.totalMarketCap / 1e8).toFixed(1)}亿`,
    ],
    price: [
      `- 最新价：${snapshot.latestPrice}，涨跌幅：${snapshot.changePercent}%`,
    ],
    momentum: [
      `- 5日收益：${snapshot.return5d}%，20日收益：${snapshot.return20d}%，60日收益：${snapshot.return60d}%`,
    ],
    ma: [
      `- MA5：${snapshot.movingAverage5}，MA20：${snapshot.movingAverage20}，MA60：${snapshot.movingAverage60}`,
      `- 20日价格位置：${(snapshot.pricePosition20d * 100).toFixed(1)}%（0=最低,100=最高）`,
    ],
    volume: [
      `- 量比：${snapshot.volumeBreakout}（>1 放量）`,
      `- 换手率：${snapshot.turnoverRate}%`,
      `- 20日日均成交额：${(snapshot.averageTurnoverAmount20d / 1e8).toFixed(1)}亿`,
    ],
    volatility: [
      `- 20日波动率：${snapshot.volatility20d}，波动率分位：${(snapshot.volatilityRank * 100).toFixed(1)}%`,
      `- 20日振幅：${snapshot.amplitude20d}%，连跌天数：${snapshot.declineDays20d}天`,
    ],
    market: [
      `- 趋势：${marketState.trend}，波动率：${marketState.volatility}`,
      `- 流动性：${marketState.liquidity}，情绪：${marketState.sentiment}，风格：${marketState.style}`,
      `- 中证500 20日涨幅：${marketState.csi500Return20d}%`,
      `- 年化波动率：${marketState.annualizedVolatility20d}%`,
      `- 上涨股占比：${(marketState.risingRatio * 100).toFixed(1)}%`,
    ],
  }
}

/** technical 是 price + ma + volume 的复合别名 */
const TECHNICAL_ALIAS = ['price', 'ma', 'volume']

function buildStockContext(
  snapshot: StockAnalysisStockSnapshot,
  marketState: StockAnalysisMarketState,
  infoSubset?: string[],
): string {
  const sections = getDataSections(snapshot, marketState)

  // 没有指定 infoSubset 或为空数组时，返回全部数据（向后兼容）
  if (!infoSubset || infoSubset.length === 0) {
    return [
      `## 股票信息`,
      ...sections.basic,
      ``,
      `## 技术指标`,
      ...sections.momentum,
      ...sections.ma,
      ...sections.volume,
      ...sections.volatility,
      ``,
      `## 市场环境`,
      ...sections.market,
    ].join('\n')
  }

  // 展开 technical 别名
  const resolvedKeys = new Set<string>()
  for (const key of infoSubset) {
    if (key === 'technical') {
      for (const alias of TECHNICAL_ALIAS) resolvedKeys.add(alias)
    } else {
      resolvedKeys.add(key)
    }
  }

  const lines: string[] = []

  // 股票基础信息（basic 或 price 触发）
  if (resolvedKeys.has('basic') || resolvedKeys.has('price')) {
    lines.push(`## 股票信息`)
    if (resolvedKeys.has('basic')) lines.push(...sections.basic)
    else if (resolvedKeys.has('price')) lines.push(...sections.price)
    lines.push(``)
  }

  // 技术/量化指标
  const techLines: string[] = []
  if (resolvedKeys.has('momentum')) techLines.push(...sections.momentum)
  if (resolvedKeys.has('ma')) techLines.push(...sections.ma)
  if (resolvedKeys.has('volume')) techLines.push(...sections.volume)
  if (resolvedKeys.has('volatility')) techLines.push(...sections.volatility)
  if (techLines.length > 0) {
    lines.push(`## 技术指标`)
    lines.push(...techLines)
    lines.push(``)
  }

  // 市场环境
  if (resolvedKeys.has('market')) {
    lines.push(`## 市场环境`)
    lines.push(...sections.market)
  }

  return lines.join('\n')
}

/** 构建专家的 system message（角色定义 + 画像） */
function buildExpertSystemMessage(
  expert: StockAnalysisExpertDefinition,
  profile?: ExpertProfile,
): string {
  const profileSection = profile && profile.predictionCount > 0
    ? `\n\n${formatExpertProfileForPrompt(profile)}`
    : ''

  if (expert.systemPrompt) {
    return [
      `你是"${expert.name}"。`,
      ``,
      expert.systemPrompt,
      profileSection,
      ``,
      `请严格按 JSON 格式返回分析结果，不要添加任何额外文本。`,
    ].filter(Boolean).join('\n')
  }
  // 回退到旧版 layer + stance 拼接
  const layerPrompt = LAYER_PROMPTS[expert.layer as Exclude<StockAnalysisExpertLayer, 'rule_functions'>]
  const stanceGuide = STANCE_GUIDE[expert.stance]
  return [
    `你是"${expert.name}"，一位专业的 A 股分析师。`,
    ``,
    layerPrompt,
    stanceGuide,
    expert.frameworkPrompt ? `补充要求：${expert.frameworkPrompt}` : '',
    profileSection,
    ``,
    `请严格按 JSON 格式返回分析结果，不要添加任何额外文本。`,
  ].filter(Boolean).join('\n')
}

/**
 * 输入 prompt 总字符数上限。
 * 中文约 1.5-2 token/字符，50000 字符约 75000-100000 token。
 * 大部分模型的上下文窗口 >= 128K token，50000 字符是安全上限。
 * 如果超限，优先截断记忆部分（记忆是最长的可变长内容）。
 */
const MAX_PROMPT_CHARS = 50_000

/** 构建专家的 user message（数据 + FactPool 摘要 + 记忆 + 任务） */
function buildExpertUserMessage(
  expert: StockAnalysisExpertDefinition,
  snapshot: StockAnalysisStockSnapshot,
  marketState: StockAnalysisMarketState,
  factPoolSummary?: FactPoolSummary,
  memoryStore?: ExpertMemoryStore,
): string {
  const stockContext = buildStockContext(snapshot, marketState, expert.infoSubset)

  const sections: string[] = [stockContext]

  // 注入 FactPool 摘要
  let factPoolText = ''
  if (factPoolSummary) {
    factPoolText = formatFactPoolSummaryForPrompt(factPoolSummary) ?? ''
    if (factPoolText) {
      sections.push(`\n## 宏观与市场情报\n${factPoolText}`)
    }
  }

  // 注入专家记忆（带长度保护）
  if (memoryStore) {
    const memory = memoryStore.memories[expert.id]
    let memoryText = buildMemoryContext(memory)
    if (memoryText) {
      // 计算已用字符数（股票数据 + FactPool + 任务模板约 300 字符），为记忆留余量
      const usedChars = stockContext.length + factPoolText.length + 400
      const memoryBudget = MAX_PROMPT_CHARS - usedChars
      if (memoryText.length > memoryBudget && memoryBudget > 500) {
        const originalLen = memoryText.length
        memoryText = memoryText.slice(0, memoryBudget) + '\n...(记忆内容已截断)'
        logger.warn(`[llm-inference] 专家 ${expert.name} 记忆上下文超长 (${originalLen} 字符)，已截断至 ${memoryBudget} 字符`, { module: 'StockAnalysis' })
      }
      if (memoryBudget > 500) {
        sections.push(`\n${memoryText}`)
      }
    }
  }

  sections.push(
    ``,
    `## 任务`,
    `基于以上数据，给出你的分析判断。请严格按以下 JSON 格式返回（不要附加任何其他内容）：`,
    ``,
    '```json',
    `{`,
    `  "verdict": "bullish 或 bearish 或 neutral",`,
    `  "confidence": 0到100的整数,`,
    `  "reason": "一句话简要理由（不超过50字）"`,
    `}`,
    '```',
  )

  return sections.join('\n')
}

// ==================== LLM API 调用 ====================

interface LLMResponse {
  verdict: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  reason: string
}

/** 单次 LLM 调用超时（毫秒）— 保留深度思考模式，需要足够长的超时 */
const LLM_CALL_TIMEOUT_MS = 360_000
const EXPERT_VOTING_TIMEOUT_MS = 30 * 60 * 1000
const MIN_EFFECTIVE_LLM_VOTES = 8

/**
 * [P2-7] max_tokens 默认值，区分大/小模型。
 * 大模型 (有 provider.maxTokens 配置的): 使用配置值
 * 未配置时: 使用保守默认值 8192，避免超出小模型上限
 * 如果某个供应商的模型支持更大值，应在 ai-config.json 中显式设置 maxTokens。
 */
const DEFAULT_MAX_TOKENS = 8_192

/** 一个可尝试的 provider + model 组合 */
interface LLMCandidate {
  provider: StockAnalysisAIProvider
  modelId: string
}

/**
 * 底层：对指定 provider + model 发起一次 LLM 调用。
 * 成功返回解析后的结果，失败直接 throw。
 */
async function callLLMOnce(
  provider: StockAnalysisAIProvider,
  modelId: string,
  systemMessage: string,
  userMessage: string,
): Promise<{ verdict: 'bullish' | 'bearish' | 'neutral'; confidence: number; reason: string; latencyMs: number }> {
  const start = Date.now()

  try {
    const data = await callProviderText({
      provider,
      modelId,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      maxTokens: provider.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: 0.3,
      userAgent: 'ClawOS/StockAnalysis LLM-Inference',
      timeoutMs: LLM_CALL_TIMEOUT_MS,
    })
    const latencyMs = data.latencyMs
    // P1-9: 优先从 content 获取，剥离 <think> 标签；fallback 到 reasoning_content 之后的内容
    let content = data.content ?? ''
    const reasoningContent = data.reasoningContent
    content = stripThinkingTags(content)
    // 某些模型（如 DeepSeek R1）将 thinking 放在 reasoning_content，正式回答在 content
    if (!content.trim() && reasoningContent) {
      // content 为空但有 reasoning_content，说明模型可能把答案放在了 reasoning_content 末尾
      // 这种情况下 content 应该包含答案，如果为空则无法恢复
      logger.warn('[llm-inference] content 为空但存在 reasoning_content，模型可能未正确输出答案')
    }
    const parsed = parseLLMResponse(content)

    // 记录 LLM 调用全量日志（JSONL）
    saLog.llmCall({
      timestamp: new Date().toISOString(),
      module: 'inference',
      model: modelId,
      providerId: provider.id,
      agentName: modelId,
      prompt: { system: systemMessage, user: userMessage },
      response: content,
      reasoningContent,
      latencyMs,
      tokens: data.usage ? {
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
        total: data.usage.total_tokens,
      } : undefined,
      success: true,
    })

    return { ...parsed, latencyMs }
  } catch (error) {
    const latencyMs = Date.now() - start
    const errMsg = error instanceof Error ? error.message : '未知错误'

    // 记录失败的 LLM 调用日志
    saLog.llmCall({
      timestamp: new Date().toISOString(),
      module: 'inference',
      model: modelId,
      providerId: provider.id,
      agentName: modelId,
      prompt: { system: systemMessage, user: userMessage },
      response: null,
      latencyMs,
      success: false,
      error: errMsg,
    })

    throw error
  }
}

/**
 * 调用单个专家的 LLM API，带自动 fallback：
 * 1. 先尝试主分配的 provider + model
 * 2. 失败后依次尝试 fallbackCandidates 中的其他 provider + model
 * 3. 全部失败才降级为规则推断
 */
async function callExpertLLMWithFallback(
  expert: StockAnalysisExpertDefinition,
  primaryCandidate: LLMCandidate,
  fallbackCandidates: LLMCandidate[],
  snapshot: StockAnalysisStockSnapshot,
  marketState: StockAnalysisMarketState,
  profile?: ExpertProfile,
  factPoolSummary?: FactPoolSummary,
  memoryStore?: ExpertMemoryStore,
): Promise<ExpertVote> {
  const systemMessage = buildExpertSystemMessage(expert, profile)
  const userMessage = buildExpertUserMessage(expert, snapshot, marketState, factPoolSummary, memoryStore)

  // 构造尝试顺序：主候选 → fallback 候选（去掉与主候选重复的）
  const allCandidates: LLMCandidate[] = [primaryCandidate]
  for (const fb of fallbackCandidates) {
    const isDup = fb.provider.id === primaryCandidate.provider.id
      && fb.modelId === primaryCandidate.modelId
    if (!isDup) allCandidates.push(fb)
  }

  const errors: string[] = []

  for (let i = 0; i < allCandidates.length; i++) {
    const candidate = allCandidates[i]
    const isFallback = i > 0
    const tag = isFallback
      ? `[fallback ${i}/${allCandidates.length - 1}: ${candidate.provider.name}/${candidate.modelId}]`
      : `[primary: ${candidate.provider.name}/${candidate.modelId}]`

    // P2-C5: 跳过已熔断的 provider
    if (isProviderCircuitOpen(candidate.provider.id)) {
      errors.push(`${tag} provider 已熔断，跳过`)
      continue
    }

    try {
      const result = await callLLMOnce(
        candidate.provider,
        candidate.modelId,
        systemMessage,
        userMessage,
      )

      recordProviderSuccess(candidate.provider.id)

      if (isFallback) {
        logger.info(`[llm-inference] 专家 ${expert.name} ${tag} fallback 成功 (${result.latencyMs}ms)`, { module: 'StockAnalysis' })
      }

      // 记录专家调用成功详情
      saLog.info('LLM-Inference', `专家 ${expert.name} ${tag} 完成: verdict=${result.verdict} confidence=${result.confidence} latency=${result.latencyMs}ms fallback=${isFallback}`)

      return {
        expertId: expert.id,
        expertName: expert.name,
        layer: expert.layer,
        stance: expert.stance,
        verdict: result.verdict,
        confidence: result.confidence,
        reason: result.reason,
        modelId: candidate.modelId,
        usedFallback: isFallback,
        latencyMs: result.latencyMs,
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : '未知错误'
      errors.push(`${tag} ${errMsg}`)
      recordProviderFailure(candidate.provider.id)
      logger.warn(`[llm-inference] 专家 ${expert.name} ${tag} 调用失败: ${errMsg}`, { module: 'StockAnalysis' })
      saLog.warn('LLM-Inference', `专家 ${expert.name} ${tag} 调用失败: ${errMsg}`)
    }
  }

  // 所有候选都失败了，降级为规则推断
  logger.warn(`[llm-inference] 专家 ${expert.name} 全部 ${allCandidates.length} 个候选模型均失败，降级为规则推断`, { module: 'StockAnalysis' })
  saLog.warn('LLM-Inference', `专家 ${expert.name} 全部 ${allCandidates.length} 个候选模型均失败，降级为规则推断。错误: ${errors.join('; ')}`)
  return buildFallbackVote(expert, snapshot, 0)
}

/** P1-9: 剥离 LLM thinking 模式产生的 <think>...</think> 标签 */
function stripThinkingTags(text: string): string {
  // 移除 <think>...</think> 块（贪婪匹配，支持多行）
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

/** [L3] 从文本中提取最外层的 JSON 对象，支持嵌套花括号 */
function extractOutermostJson(text: string): string | null {
  const start = text.indexOf('{')
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
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1) }
  }
  return null
}

/** 解析 LLM 返回的 JSON 内容 */
function parseLLMResponse(content: string): LLMResponse {
  // 尝试直接解析
  try {
    const raw = JSON.parse(content)
    return validateLLMResponse(raw)
  } catch {
    // 尝试从 markdown code block 中提取 JSON
  }

  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      const raw = JSON.parse(jsonMatch[1].trim())
      return validateLLMResponse(raw)
    } catch {
      // 继续尝试
    }
  }

  // [L3] 使用括号匹配提取最外层 JSON 对象（支持嵌套）
  const extracted = extractOutermostJson(content)
  if (extracted) {
    try {
      const raw = JSON.parse(extracted)
      return validateLLMResponse(raw)
    } catch {
      // 解析失败
    }
  }

  throw new Error(`无法解析 LLM 返回内容: ${content.slice(0, 100)}`)
}

function validateLLMResponse(raw: Record<string, unknown>): LLMResponse {
  const verdict = String(raw.verdict ?? '').toLowerCase()
  if (verdict !== 'bullish' && verdict !== 'bearish' && verdict !== 'neutral') {
    throw new Error(`无效的 verdict: ${verdict}`)
  }
  const confidence = Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 50)))
  const reason = String(raw.reason ?? '无理由').slice(0, 100)

  return { verdict, confidence, reason }
}

/** LLM 调用失败时，基于专家立场和市场数据推断一个合理的投票 */
function buildFallbackVote(
  expert: StockAnalysisExpertDefinition,
  snapshot: StockAnalysisStockSnapshot,
  latencyMs: number,
): ExpertVote {
  let verdict: ExpertVote['verdict']
  let confidence: number
  let reason: string

  // 基于立场和市场数据做简单推断
  const bullishSignal = snapshot.return20d > 0 && snapshot.latestPrice > snapshot.movingAverage20
  const bearishSignal = snapshot.return20d < -5 && snapshot.declineDays20d > 5

  if (expert.stance === 'bullish') {
    verdict = bullishSignal ? 'bullish' : bearishSignal ? 'bearish' : 'neutral'
    confidence = bullishSignal ? 60 : 40
    reason = bullishSignal ? '趋势向好，立场偏多' : '数据偏弱，谨慎观望'
  } else if (expert.stance === 'bearish') {
    verdict = bearishSignal ? 'bearish' : bullishSignal ? 'bullish' : 'neutral'
    confidence = bearishSignal ? 60 : 40
    reason = bearishSignal ? '下行趋势明确，谨慎' : '数据尚可，但需关注风险'
  } else {
    verdict = bullishSignal ? 'bullish' : bearishSignal ? 'bearish' : 'neutral'
    confidence = 50
    reason = '中性立场，基于数据研判'
  }

  return {
    expertId: expert.id,
    expertName: expert.name,
    layer: expert.layer,
    stance: expert.stance,
    verdict,
    confidence,
    reason: `[规则降级] ${reason}`,
    modelId: expert.assignedModel?.modelId ?? 'rule-fallback',
    usedFallback: true,
    latencyMs,
  }
}

// ==================== 15 个规则函数专家 ====================

/** 规则函数专家不调用 LLM，直接基于技术指标计算 */
function buildRuleExpertVote(
  expert: StockAnalysisExpertDefinition,
  snapshot: StockAnalysisStockSnapshot,
  marketState: StockAnalysisMarketState,
): ExpertVote {
  const { verdict, confidence, reason } = evaluateRuleFunction(expert.name, snapshot, marketState)
  return {
    expertId: expert.id,
    expertName: expert.name,
    layer: expert.layer,
    stance: expert.stance,
    verdict,
    confidence,
    reason,
    modelId: 'rule-engine',
    usedFallback: false,
    latencyMs: 0,
  }
}

function evaluateRuleFunction(
  ruleName: string,
  snapshot: StockAnalysisStockSnapshot,
  marketState: StockAnalysisMarketState,
): { verdict: ExpertVote['verdict']; confidence: number; reason: string } {
  switch (ruleName) {
    case '5日动量':
      return snapshot.return5d > 2 ? { verdict: 'bullish', confidence: 65, reason: `5日涨${snapshot.return5d}%` }
        : snapshot.return5d < -2 ? { verdict: 'bearish', confidence: 65, reason: `5日跌${snapshot.return5d}%` }
        : { verdict: 'neutral', confidence: 50, reason: '5日动量平缓' }
    case '20日动量':
      return snapshot.return20d > 5 ? { verdict: 'bullish', confidence: 70, reason: `20日涨${snapshot.return20d}%` }
        : snapshot.return20d < -5 ? { verdict: 'bearish', confidence: 70, reason: `20日跌${snapshot.return20d}%` }
        : { verdict: 'neutral', confidence: 50, reason: '20日动量一般' }
    case '60日动量':
      return snapshot.return60d > 10 ? { verdict: 'bullish', confidence: 60, reason: `60日涨${snapshot.return60d}%` }
        : snapshot.return60d < -10 ? { verdict: 'bearish', confidence: 60, reason: `60日跌${snapshot.return60d}%` }
        : { verdict: 'neutral', confidence: 50, reason: '60日动量平稳' }
    case 'RSI均值回归':
      return snapshot.pricePosition20d > 0.85 ? { verdict: 'bearish', confidence: 60, reason: '价格位置偏高，超买风险' }
        : snapshot.pricePosition20d < 0.15 ? { verdict: 'bullish', confidence: 60, reason: '价格位置偏低，超卖反弹' }
        : { verdict: 'neutral', confidence: 50, reason: 'RSI 区间正常' }
    case '布林带均值回归':
      return snapshot.pricePosition20d > 0.9 ? { verdict: 'bearish', confidence: 55, reason: '触及布林上轨' }
        : snapshot.pricePosition20d < 0.1 ? { verdict: 'bullish', confidence: 55, reason: '触及布林下轨' }
        : { verdict: 'neutral', confidence: 50, reason: '布林带内运行' }
    case 'MA60偏离均值回归': {
      if (!snapshot.movingAverage60) return { verdict: 'neutral', confidence: 50, reason: 'MA60 数据不足' }
      const deviation = (snapshot.latestPrice - snapshot.movingAverage60) / snapshot.movingAverage60 * 100
      return deviation > 15 ? { verdict: 'bearish', confidence: 60, reason: `偏离MA60+${deviation.toFixed(1)}%` }
        : deviation < -15 ? { verdict: 'bullish', confidence: 60, reason: `偏离MA60${deviation.toFixed(1)}%` }
        : { verdict: 'neutral', confidence: 50, reason: 'MA60偏离正常' }
    }
    case '量比评分':
      return snapshot.volumeBreakout > 1.5 ? { verdict: 'bullish', confidence: 65, reason: `量比${snapshot.volumeBreakout}放量` }
        : snapshot.volumeBreakout < 0.6 ? { verdict: 'bearish', confidence: 55, reason: '缩量明显' }
        : { verdict: 'neutral', confidence: 50, reason: '量能正常' }
    case '换手率评分':
      return snapshot.turnoverRate > 5 ? { verdict: 'bullish', confidence: 60, reason: `换手率${snapshot.turnoverRate}%活跃` }
        : snapshot.turnoverRate < 1 ? { verdict: 'bearish', confidence: 55, reason: '换手率低迷' }
        : { verdict: 'neutral', confidence: 50, reason: '换手率适中' }
    case '资金流向评分':
      return snapshot.volumeBreakout > 1.2 && snapshot.changePercent > 0
        ? { verdict: 'bullish', confidence: 65, reason: '放量上涨，资金流入' }
        : snapshot.volumeBreakout > 1.2 && snapshot.changePercent < 0
        ? { verdict: 'bearish', confidence: 65, reason: '放量下跌，资金流出' }
        : { verdict: 'neutral', confidence: 50, reason: '资金流向不明确' }
    case 'ATR波动率':
      return snapshot.volatility20d > 40 ? { verdict: 'bearish', confidence: 60, reason: `波动率${snapshot.volatility20d}偏高` }
        : snapshot.volatility20d < 15 ? { verdict: 'bullish', confidence: 55, reason: '低波动率蓄力' }
        : { verdict: 'neutral', confidence: 50, reason: '波动率正常' }
    case '历史波动率分位':
      return snapshot.volatilityRank > 0.8 ? { verdict: 'bearish', confidence: 60, reason: '波动率处于历史高位' }
        : snapshot.volatilityRank < 0.2 ? { verdict: 'bullish', confidence: 55, reason: '波动率处于历史低位' }
        : { verdict: 'neutral', confidence: 50, reason: '波动率分位正常' }
    case '板块相对动量':
      return snapshot.return20d > marketState.csi500Return20d + 5
        ? { verdict: 'bullish', confidence: 65, reason: '跑赢大盘明显' }
        : snapshot.return20d < marketState.csi500Return20d - 5
        ? { verdict: 'bearish', confidence: 65, reason: '跑输大盘明显' }
        : { verdict: 'neutral', confidence: 50, reason: '与大盘走势接近' }
    case '板块排名变化':
      return snapshot.return5d > snapshot.return20d / 4 + 1
        ? { verdict: 'bullish', confidence: 55, reason: '近期加速上涨' }
        : snapshot.return5d < snapshot.return20d / 4 - 1
        ? { verdict: 'bearish', confidence: 55, reason: '近期走弱' }
        : { verdict: 'neutral', confidence: 50, reason: '节奏稳定' }
    case '组合风险':
      return marketState.volatility === 'high_volatility'
        ? { verdict: 'bearish', confidence: 60, reason: '市场高波动，组合风险偏高' }
        : marketState.sentiment === 'pessimistic'
        ? { verdict: 'bearish', confidence: 55, reason: '市场情绪悲观' }
        : { verdict: 'neutral', confidence: 50, reason: '组合风险可控' }
    case '个股风险':
      return snapshot.declineDays20d >= 10
        ? { verdict: 'bearish', confidence: 70, reason: `连跌${snapshot.declineDays20d}日` }
        : snapshot.volatility20d > 50
        ? { verdict: 'bearish', confidence: 60, reason: '个股波动率过高' }
        : { verdict: 'neutral', confidence: 50, reason: '个股风险可控' }
    default:
      return { verdict: 'neutral', confidence: 50, reason: '未识别的规则函数' }
  }
}

// ==================== 批量推理入口 ====================

/** provider.concurrency 未设置时的默认并发数 */
const DEFAULT_PROVIDER_CONCURRENCY = 3

/** 全局并发总上限，防止同时发出过多请求 */
const MAX_GLOBAL_CONCURRENCY = 8

/** P2-C5: Provider 级熔断 — 连续失败达到阈值后短期内跳过该 provider */
const PROVIDER_CIRCUIT_BREAKER_THRESHOLD = 3 // 连续失败次数
const PROVIDER_CIRCUIT_BREAKER_COOLDOWN_MS = 60_000 // 熔断冷却时间 60 秒
const providerFailureCount = new Map<string, number>()
const providerCircuitOpenAt = new Map<string, number>()

function isProviderCircuitOpen(providerId: string): boolean {
  const openAt = providerCircuitOpenAt.get(providerId)
  if (!openAt) return false
  if (Date.now() - openAt > PROVIDER_CIRCUIT_BREAKER_COOLDOWN_MS) {
    // 冷却期结束，重置熔断器
    providerCircuitOpenAt.delete(providerId)
    providerFailureCount.delete(providerId)
    return false
  }
  return true
}

function recordProviderFailure(providerId: string) {
  const count = (providerFailureCount.get(providerId) ?? 0) + 1
  providerFailureCount.set(providerId, count)
  if (count >= PROVIDER_CIRCUIT_BREAKER_THRESHOLD) {
    providerCircuitOpenAt.set(providerId, Date.now())
    logger.warn(`[llm-inference] Provider ${providerId} 熔断：连续 ${count} 次失败，暂停 ${PROVIDER_CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s`)
  }
}

function recordProviderSuccess(providerId: string) {
  providerFailureCount.delete(providerId)
  providerCircuitOpenAt.delete(providerId)
}

/**
 * 构建 fallback 候选列表：收集所有 enabled provider 的全部 model，
 * 排除当前专家的主分配，作为兜底重试池。
 * [P2-11] 优先不同 provider 的候选排在前面，同 provider 不同 model 排在后面。
 */
function buildFallbackCandidates(
  providerMap: Map<string, StockAnalysisAIProvider>,
  excludeProviderId: string,
  excludeModelId: string,
): LLMCandidate[] {
  const differentProvider: LLMCandidate[] = []
  const sameProvider: LLMCandidate[] = []
  for (const provider of providerMap.values()) {
    for (const modelId of provider.models) {
      if (provider.id === excludeProviderId && modelId === excludeModelId) continue
      if (isUnsupportedCandidate(provider, modelId)) {
        saLog.warn('LLM-Inference', `跳过已知不支持候选: ${provider.name}/${modelId}`)
        continue
      }
      if (provider.id === excludeProviderId) {
        sameProvider.push({ provider, modelId })
      } else {
        differentProvider.push({ provider, modelId })
      }
    }
  }
  return [...differentProvider, ...sameProvider]
}

/**
 * 对一只股票运行所有 45 个专家的投票
 * - 30 个 LLM 专家：带 fallback 的并发调用，一个模型失败自动切换到其他模型/供应商
 * - 15 个规则函数专家：本地计算
 * 返回聚合的 LLMExpertScore
 */
export async function runExpertVoting(
  snapshot: StockAnalysisStockSnapshot,
  marketState: StockAnalysisMarketState,
  aiConfig: StockAnalysisAIConfig,
  expertWeights?: Map<string, number>,
  profileMap?: Map<string, ExpertProfile>,
  factPoolSummary?: FactPoolSummary,
  memoryStore?: ExpertMemoryStore,
): Promise<LLMExpertScore> {
  const votingStart = Date.now()
  const enabledExperts = aiConfig.experts.filter((e) => e.enabled)
  const providerMap = new Map(aiConfig.providers.filter((p) => p.enabled).map((p) => [p.id, p]))

  const ruleExperts = enabledExperts.filter((e) => e.layer === 'rule_functions')
  const llmExperts = enabledExperts.filter((e) => e.layer !== 'rule_functions' && e.assignedModel)
  const unassignedExperts = enabledExperts.filter((e) => e.layer !== 'rule_functions' && !e.assignedModel)

  saLog.info('LLM-Inference', `投票开始: 股票=${snapshot.code} 总专家=${enabledExperts.length} LLM=${llmExperts.length} 规则=${ruleExperts.length} 未分配=${unassignedExperts.length} 供应商=${providerMap.size}`)

  // 规则专家：同步计算
  const ruleVotes = ruleExperts.map((expert) => buildRuleExpertVote(expert, snapshot, marketState))

  // 未分配模型的 LLM 专家：降级为规则
  const unassignedVotes = unassignedExperts.map((expert) => buildFallbackVote(expert, snapshot, 0))

  // LLM 专家：带 fallback 的并发调用（注入记忆 + FactPool + 性能档案）
  // 整体超时保护: 30 分钟。超时时保留已成功票，剩余专家用规则降级补齐。
  let llmVotes: ExpertVote[]
  try {
    llmVotes = await runLLMWithFallback(
      llmExperts, providerMap, snapshot, marketState,
      profileMap, factPoolSummary, memoryStore,
      EXPERT_VOTING_TIMEOUT_MS,
    )
  } catch (error) {
    logger.warn(`[llm-inference] ${(error as Error).message}，使用规则降级填充全部 LLM 专家`)
    saLog.error('LLM-Inference', `LLM 并发调用异常: ${(error as Error).message}，${llmExperts.length} 个 LLM 专家全部降级为规则推断`)
    llmVotes = llmExperts.map((expert) => buildFallbackVote(expert, snapshot, 0))
  }

  const allVotes = [...ruleVotes, ...llmVotes, ...unassignedVotes]
  const result = aggregateVotes(allVotes, expertWeights)
  const votingElapsed = Date.now() - votingStart

  saLog.info('LLM-Inference', `投票完成: 股票=${snapshot.code} 总耗时=${votingElapsed}ms score=${result.score} consensus=${result.consensus} bullish=${result.bullishCount} bearish=${result.bearishCount} neutral=${result.neutralCount} llmSuccess=${result.llmSuccessCount} ruleFallback=${result.ruleFallbackCount} degradeRatio=${result.degradeRatio} isSimulated=${result.isSimulated}`)

  return result
}

/**
 * 带 fallback 的 LLM 并发调用：
 * - 按供应商分组，每个供应商使用独立的并发限制
 * - 单次调用失败后自动尝试其他供应商的模型（兜底机制）
 * - 全局并发总量不超过 MAX_GLOBAL_CONCURRENCY
 */
async function runLLMWithFallback(
  experts: StockAnalysisExpertDefinition[],
  providerMap: Map<string, StockAnalysisAIProvider>,
  snapshot: StockAnalysisStockSnapshot,
  marketState: StockAnalysisMarketState,
  profileMap?: Map<string, ExpertProfile>,
  factPoolSummary?: FactPoolSummary,
  memoryStore?: ExpertMemoryStore,
  overallTimeoutMs = EXPERT_VOTING_TIMEOUT_MS,
): Promise<ExpertVote[]> {
  // 按 providerId 分组
  const groups = new Map<string, { expert: StockAnalysisExpertDefinition; originalIndex: number }[]>()
  const noProviderVotes: { vote: ExpertVote; originalIndex: number }[] = []

  for (let i = 0; i < experts.length; i++) {
    const expert = experts[i]
    const providerId = expert.assignedModel!.providerId
    const provider = providerMap.get(providerId)

    if (!provider) {
      noProviderVotes.push({ vote: buildFallbackVote(expert, snapshot, 0), originalIndex: i })
      continue
    }

    if (!groups.has(providerId)) groups.set(providerId, [])
    groups.get(providerId)!.push({ expert, originalIndex: i })
  }

  const results: Array<ExpertVote | undefined> = new Array(experts.length)
  const startedAt = Date.now()

  function hasTimedOut() {
    return Date.now() - startedAt >= overallTimeoutMs
  }

  // 先填入无 provider 的 fallback
  for (const { vote, originalIndex } of noProviderVotes) {
    results[originalIndex] = vote
  }

  // 全局并发信号量（Promise 队列实现，避免轮询）
  let globalActive = 0
  const waitQueue: Array<() => void> = []
  function waitForGlobalSlot(): Promise<void> {
    if (globalActive < MAX_GLOBAL_CONCURRENCY) {
      globalActive++
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      waitQueue.push(() => { globalActive++; resolve() })
    })
  }
  function releaseGlobalSlot() {
    globalActive--
    if (waitQueue.length > 0) {
      const next = waitQueue.shift()!
      next()
    }
  }

  // 各供应商并行，每组内部按 concurrency 限流
  await Promise.all(
    Array.from(groups.entries()).map(async ([providerId, items]) => {
      const provider = providerMap.get(providerId)!
      const concurrency = Math.max(1, provider.concurrency || DEFAULT_PROVIDER_CONCURRENCY)
      let cursor = 0

      async function runner() {
        while (cursor < items.length) {
          if (hasTimedOut()) return

          const current = cursor
          cursor += 1
          const { expert, originalIndex } = items[current]

          await waitForGlobalSlot()
          try {
            const primaryModelId = expert.assignedModel!.modelId
            const primaryCandidate: LLMCandidate = { provider, modelId: primaryModelId }
            const fallbacks = buildFallbackCandidates(providerMap, providerId, primaryModelId)

            results[originalIndex] = await callExpertLLMWithFallback(
              expert,
              primaryCandidate,
              fallbacks,
              snapshot,
              marketState,
              profileMap?.get(expert.id),
              factPoolSummary,
              memoryStore,
            )
          } finally {
            releaseGlobalSlot()
          }
        }
      }

  await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, () => runner()),
      )
    }),
  )

  const completedVotes = results.filter((vote): vote is ExpertVote => Boolean(vote))
  const completedExpertIds = new Set(completedVotes.map((vote) => vote.expertId))
  const timedOutExperts = experts.filter((expert) => !completedExpertIds.has(expert.id))

  if (timedOutExperts.length > 0) {
    const llmSuccessCount = completedVotes.filter((vote) => vote.modelId !== 'rule-fallback' && vote.modelId !== 'rule-engine').length
    saLog.warn(
      'LLM-Inference',
      `专家投票在 ${overallTimeoutMs}ms 总预算内未全部完成：已完成=${completedVotes.length}/${experts.length}，LLM成功=${llmSuccessCount}，超时降级=${timedOutExperts.length}`,
    )

    if (llmSuccessCount < MIN_EFFECTIVE_LLM_VOTES) {
      saLog.error(
        'LLM-Inference',
        `LLM 专家有效票不足（成功=${llmSuccessCount}，最低要求=${MIN_EFFECTIVE_LLM_VOTES}），全部改为规则降级`,
      )
      return experts.map((expert) => buildFallbackVote(expert, snapshot, 0))
    }
  }

  return experts.map((expert, index) => results[index] ?? buildFallbackVote(expert, snapshot, 0))
}

/** 将所有投票聚合为专家评分（支持按专家个体动态权重加权） */
function aggregateVotes(votes: ExpertVote[], expertWeights?: Map<string, number>): LLMExpertScore {
  const bullishVotes = votes.filter((v) => v.verdict === 'bullish')
  const bearishVotes = votes.filter((v) => v.verdict === 'bearish')
  const neutralVotes = votes.filter((v) => v.verdict === 'neutral')

  const bullishCount = bullishVotes.length
  const bearishCount = bearishVotes.length
  const neutralCount = neutralVotes.length
  const totalVoters = bullishCount + bearishCount + neutralCount

  // P2-A4: neutral 投票纳入 consensus 计算 — neutral 被视为 0.5 的方向性贡献
  // 高 neutral 比例会将 consensus 拉向 0.5，降低交易信心
  const adjustedBullish = bullishCount + neutralCount * 0.5
  const adjustedTotal = bullishCount + bearishCount + neutralCount
  const consensus = adjustedTotal > 0 ? adjustedBullish / adjustedTotal : 0.5

  // P2-A5: confidence 归一化 — 对同一模型的投票进行 z-score 标准化，使不同模型的 confidence 可比
  // 按 modelId 分组计算均值和标准差，然后重新映射到 0-100 范围
  const modelConfidences = new Map<string, number[]>()
  for (const v of votes) {
    const key = v.modelId
    if (!modelConfidences.has(key)) modelConfidences.set(key, [])
    modelConfidences.get(key)!.push(v.confidence)
  }
  const normalizedConfidence = new Map<string, number>()
  for (const v of votes) {
    const group = modelConfidences.get(v.modelId)!
    if (group.length < 3) {
      // 样本不足，保持原始 confidence
      normalizedConfidence.set(v.expertId, v.confidence)
    } else {
      const mean = group.reduce((s, c) => s + c, 0) / group.length
      const std = Math.sqrt(group.reduce((s, c) => s + (c - mean) ** 2, 0) / group.length) || 1
      // z-score 映射到 50 ± 25 范围（均值=50，1 标准差=25）
      const z = (v.confidence - mean) / std
      normalizedConfidence.set(v.expertId, Math.max(5, Math.min(95, 50 + z * 25)))
    }
  }

  // 加权评分：使用归一化后的 confidence 和历史表现权重
  const getWeight = (v: ExpertVote) => (expertWeights?.get(v.expertId) ?? 1.0) * (normalizedConfidence.get(v.expertId) ?? v.confidence)
  const weightedBullish = bullishVotes.reduce((sum, v) => sum + getWeight(v), 0)
  const weightedBearish = bearishVotes.reduce((sum, v) => sum + getWeight(v), 0)
  const weightedNeutral = neutralVotes.reduce((sum, v) => sum + getWeight(v), 0)
  const totalWeight = weightedBullish + weightedBearish + weightedNeutral
  const score = totalWeight > 0
    ? ((weightedBullish * 100 + weightedNeutral * 50) / totalWeight)
    : 50

  // 区分三类投票来源：
  // 1. LLM 主模型成功（!usedFallback && modelId != rule-engine/rule-fallback）
  // 2. LLM fallback 成功（usedFallback && modelId != rule-fallback）— 真正的 LLM 分析，只是换了模型
  // 3. 规则引擎降级（modelId == rule-fallback 或 rule-engine）— 无 LLM 参与
  const llmPrimaryCount = votes.filter((v) => !v.usedFallback && v.modelId !== 'rule-engine' && v.modelId !== 'rule-fallback').length
  const llmFallbackCount = votes.filter((v) => v.usedFallback && v.modelId !== 'rule-fallback').length
  const ruleFallbackCount = votes.filter((v) => v.modelId === 'rule-fallback').length
  const ruleEngineCount = votes.filter((v) => v.modelId === 'rule-engine').length

  // LLM 成功总数 = 主模型成功 + fallback LLM 成功（两种都是真正的 LLM 分析）
  const llmSuccessCount = llmPrimaryCount + llmFallbackCount

  // 向后兼容 fallbackCount = LLM fallback + 规则降级
  const fallbackCount = llmFallbackCount + ruleFallbackCount

  // 提取 top highlights 和 risks
  const highlights = bullishVotes
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map((v) => `${v.expertName}: ${v.reason}`)

  const risks = bearishVotes
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map((v) => `${v.expertName}: ${v.reason}`)

  if (highlights.length === 0) highlights.push('暂无明确看多信号')
  if (risks.length === 0) risks.push('暂无显著结构风险')

  // 非规则引擎投票总数（LLM 专家总数，不含 15 个内置规则专家）
  const llmVoterCount = llmPrimaryCount + llmFallbackCount + ruleFallbackCount

  const aggregatedResult: LLMExpertScore = {
    bullishCount,
    bearishCount,
    neutralCount,
    consensus: Math.round(consensus * 10000) / 10000,
    score: Math.round(Math.max(0, Math.min(100, score)) * 100) / 100,
    highlights,
    risks,
    votes,
    llmSuccessCount,
    llmFallbackCount,
    ruleFallbackCount,
    fallbackCount,
    isSimulated: llmSuccessCount === 0 && ruleFallbackCount > 0,
    degradeRatio: llmVoterCount > 0
      ? Math.round((ruleFallbackCount / llmVoterCount) * 10000) / 10000
      : (totalVoters > 0 ? 0 : 1),
  }

  saLog.debug('LLM-Inference', `聚合详情: totalVoters=${totalVoters} bullish=${bullishCount} bearish=${bearishCount} neutral=${neutralCount} weightedBullish=${weightedBullish.toFixed(2)} weightedBearish=${weightedBearish.toFixed(2)} weightedNeutral=${weightedNeutral.toFixed(2)} llmPrimary=${llmPrimaryCount} llmFallback=${llmFallbackCount} ruleFallback=${ruleFallbackCount} ruleEngine=${ruleEngineCount}`)

  return aggregatedResult
}

// ==================== 测试辅助导出 ====================

export const _testing = {
  aggregateVotes,
  buildFallbackVote,
  buildFallbackCandidates,
  parseLLMResponse,
  buildStockContext,
  buildExpertSystemMessage,
  buildExpertUserMessage,
  isUnsupportedCandidate,
  LLM_CALL_TIMEOUT_MS,
  EXPERT_VOTING_TIMEOUT_MS,
  MIN_EFFECTIVE_LLM_VOTES,
}
