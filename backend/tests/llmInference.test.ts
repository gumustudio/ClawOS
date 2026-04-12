import test from 'node:test'
import assert from 'node:assert/strict'

import { _testing } from '../src/services/stock-analysis/llm-inference'
import type { ExpertVote } from '../src/services/stock-analysis/llm-inference'

const { aggregateVotes, parseLLMResponse, buildFallbackCandidates, isUnsupportedCandidate, LLM_CALL_TIMEOUT_MS, EXPERT_VOTING_TIMEOUT_MS, MIN_EFFECTIVE_LLM_VOTES } = _testing

// ==================== 辅助函数 ====================

function makeVote(overrides: Partial<ExpertVote> = {}): ExpertVote {
  return {
    expertId: 'expert-1',
    expertName: '测试专家',
    layer: 'company_fundamentals',
    stance: 'neutral',
    verdict: 'bullish',
    confidence: 70,
    reason: '测试理由',
    modelId: 'kimi-k2.5',
    usedFallback: false,
    latencyMs: 1000,
    ...overrides,
  }
}

// ==================== aggregateVotes 测试 ====================

test('aggregateVotes: 全部主模型成功 → degradeRatio=0, isSimulated=false', () => {
  const votes: ExpertVote[] = [
    makeVote({ expertId: 'e1', verdict: 'bullish', modelId: 'kimi-k2.5', usedFallback: false }),
    makeVote({ expertId: 'e2', verdict: 'bearish', modelId: 'glm-5', usedFallback: false }),
    makeVote({ expertId: 'e3', verdict: 'neutral', modelId: 'kimi-k2.5', usedFallback: false }),
  ]
  const result = aggregateVotes(votes)

  assert.equal(result.llmSuccessCount, 3, 'LLM 成功应为 3')
  assert.equal(result.llmFallbackCount, 0, 'LLM fallback 应为 0')
  assert.equal(result.ruleFallbackCount, 0, '规则降级应为 0')
  assert.equal(result.degradeRatio, 0, '降级比例应为 0')
  assert.equal(result.isSimulated, false, '不应为模拟')
})

test('aggregateVotes: LLM fallback 成功不算降级 → degradeRatio=0', () => {
  const votes: ExpertVote[] = [
    makeVote({ expertId: 'e1', modelId: 'kimi-k2.5', usedFallback: false }),
    makeVote({ expertId: 'e2', modelId: 'glm-5', usedFallback: true }),  // fallback 到其他 LLM
    makeVote({ expertId: 'e3', modelId: 'kimi-k2.5', usedFallback: true }),  // fallback 到其他 LLM
  ]
  const result = aggregateVotes(votes)

  assert.equal(result.llmSuccessCount, 3, 'LLM 成功应包含 fallback 的 2 个')
  assert.equal(result.llmFallbackCount, 2, 'LLM fallback 应为 2')
  assert.equal(result.ruleFallbackCount, 0, '规则降级应为 0')
  assert.equal(result.degradeRatio, 0, '降级比例应为 0（LLM fallback 不算降级）')
  assert.equal(result.isSimulated, false, '不应为模拟')
})

test('aggregateVotes: 部分规则降级 → degradeRatio > 0', () => {
  const votes: ExpertVote[] = [
    makeVote({ expertId: 'e1', modelId: 'kimi-k2.5', usedFallback: false }),
    makeVote({ expertId: 'e2', modelId: 'glm-5', usedFallback: true }),  // LLM fallback
    makeVote({ expertId: 'e3', modelId: 'rule-fallback', usedFallback: true, reason: '[规则降级] 测试' }),  // 规则降级
  ]
  const result = aggregateVotes(votes)

  assert.equal(result.llmSuccessCount, 2, 'LLM 成功应为 2（主+fallback）')
  assert.equal(result.llmFallbackCount, 1, 'LLM fallback 应为 1')
  assert.equal(result.ruleFallbackCount, 1, '规则降级应为 1')
  // degradeRatio = 1 / (2 + 1) = 0.3333
  assert.ok(result.degradeRatio > 0.33 && result.degradeRatio < 0.34, `降级比例应约 0.3333，实际: ${result.degradeRatio}`)
  assert.equal(result.isSimulated, false, '不应为模拟（仍有 LLM 成功）')
})

test('aggregateVotes: 全部规则降级 → isSimulated=true, degradeRatio=1', () => {
  const votes: ExpertVote[] = [
    makeVote({ expertId: 'e1', modelId: 'rule-fallback', usedFallback: true }),
    makeVote({ expertId: 'e2', modelId: 'rule-fallback', usedFallback: true }),
    // 加一个规则引擎（15个内置的）
    makeVote({ expertId: 'r1', modelId: 'rule-engine', usedFallback: false }),
  ]
  const result = aggregateVotes(votes)

  assert.equal(result.llmSuccessCount, 0, 'LLM 成功应为 0')
  assert.equal(result.ruleFallbackCount, 2, '规则降级应为 2')
  assert.equal(result.degradeRatio, 1, '降级比例应为 1')
  assert.equal(result.isSimulated, true, '应为模拟（零 LLM 成功）')
})

test('aggregateVotes: 混合投票类型正确计数', () => {
  const votes: ExpertVote[] = [
    // 5 个主模型成功
    ...Array.from({ length: 5 }, (_, i) => makeVote({ expertId: `p${i}`, modelId: 'kimi-k2.5', usedFallback: false })),
    // 20 个 LLM fallback 成功
    ...Array.from({ length: 20 }, (_, i) => makeVote({ expertId: `f${i}`, modelId: 'glm-5', usedFallback: true })),
    // 5 个规则降级
    ...Array.from({ length: 5 }, (_, i) => makeVote({ expertId: `r${i}`, modelId: 'rule-fallback', usedFallback: true })),
    // 15 个规则引擎（内置）
    ...Array.from({ length: 15 }, (_, i) => makeVote({ expertId: `re${i}`, modelId: 'rule-engine', usedFallback: false })),
  ]
  const result = aggregateVotes(votes)

  assert.equal(result.llmSuccessCount, 25, 'LLM 成功 = 5 主 + 20 fallback')
  assert.equal(result.llmFallbackCount, 20, 'LLM fallback = 20')
  assert.equal(result.ruleFallbackCount, 5, '规则降级 = 5')
  assert.equal(result.fallbackCount, 25, '向后兼容 fallbackCount = 20 + 5')
  // degradeRatio = 5 / (25 + 5) = 0.1667
  assert.ok(result.degradeRatio > 0.16 && result.degradeRatio < 0.17, `降级比例应约 0.1667，实际: ${result.degradeRatio}`)
  assert.equal(result.isSimulated, false)
})

test('aggregateVotes: 只有规则引擎投票 → 非模拟, degradeRatio=0', () => {
  const votes: ExpertVote[] = [
    makeVote({ expertId: 'r1', modelId: 'rule-engine', usedFallback: false }),
    makeVote({ expertId: 'r2', modelId: 'rule-engine', usedFallback: false }),
  ]
  const result = aggregateVotes(votes)

  // 只有 rule-engine，没有 LLM 专家参与，不算降级
  assert.equal(result.llmSuccessCount, 0)
  assert.equal(result.ruleFallbackCount, 0)
  assert.equal(result.degradeRatio, 0, '纯规则引擎不算降级')
  assert.equal(result.isSimulated, false, '纯规则引擎不算模拟（无 rule-fallback）')
})

test('aggregateVotes: 空投票列表', () => {
  const result = aggregateVotes([])
  assert.equal(result.bullishCount, 0)
  assert.equal(result.bearishCount, 0)
  assert.equal(result.llmSuccessCount, 0)
  assert.equal(result.degradeRatio, 1, '空列表降级比例应为 1')
})

// ==================== parseLLMResponse 测试 ====================

test('parseLLMResponse: 解析标准 JSON', () => {
  const input = '{"verdict": "bullish", "confidence": 75, "reason": "基本面良好"}'
  const result = parseLLMResponse(input)
  assert.equal(result.verdict, 'bullish')
  assert.equal(result.confidence, 75)
  assert.equal(result.reason, '基本面良好')
})

test('parseLLMResponse: 解析 markdown 包裹的 JSON', () => {
  const input = '分析结果如下：\n```json\n{"verdict": "bearish", "confidence": 60, "reason": "估值过高"}\n```'
  const result = parseLLMResponse(input)
  assert.equal(result.verdict, 'bearish')
  assert.equal(result.confidence, 60)
})

test('parseLLMResponse: confidence 越界修正', () => {
  const input = '{"verdict": "neutral", "confidence": 150, "reason": "测试"}'
  const result = parseLLMResponse(input)
  assert.equal(result.confidence, 100, 'confidence 超过 100 应该被钳位到 100')
})

test('llm inference timeout constants are widened for slow models', () => {
  assert.equal(LLM_CALL_TIMEOUT_MS, 360_000)
  assert.equal(EXPERT_VOTING_TIMEOUT_MS, 30 * 60 * 1000)
  assert.equal(MIN_EFFECTIVE_LLM_VOTES, 8)
})

test('buildFallbackCandidates skips known unsupported provider-model pairs', () => {
  const providerMap = new Map([
    ['opencodego', {
      id: 'opencodego',
      name: 'OpenCodeGo',
      baseUrl: 'https://example.com',
      apiKey: 'key',
      models: ['MiMo-V2-Pro', 'GLM-5', 'Qwen3-32B'],
      concurrency: 1,
      enabled: true,
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z',
    }],
    ['other', {
      id: 'other',
      name: 'OtherProvider',
      baseUrl: 'https://example.org',
      apiKey: 'key',
      models: ['GLM-5'],
      concurrency: 1,
      enabled: true,
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z',
    }],
  ])

  const candidates = buildFallbackCandidates(providerMap, 'opencodego', 'Qwen3-32B')
  assert.deepEqual(
    candidates.map((candidate) => `${candidate.provider.name}/${candidate.modelId}`),
    ['OtherProvider/GLM-5'],
  )
  assert.equal(isUnsupportedCandidate(providerMap.get('opencodego')!, 'MiMo-V2-Pro'), true)
})
