import test from 'node:test'
import assert from 'node:assert/strict'

import { _testing } from '../src/services/stock-analysis/llm-extraction'

const { extractJsonFromText, pickPrimaryCandidate, buildFallbackCandidates, isUnsupportedCandidate, AGENT_FALLBACK_BUDGET_MS, LLM_CALL_TIMEOUT_MS } = _testing

test('extractJsonFromText object-first parses sentiment object with nested arrays', () => {
  const input = `\`\`\`json
{
  "overallSentiment": 0.75,
  "bullRatio": 0.78,
  "bearRatio": 0.14,
  "neutralRatio": 0.08,
  "hotTopics": ["A", "B"],
  "sentimentChange24h": 0.55,
  "herdingSignal": "extreme"
}
\`\`\``

  const result = extractJsonFromText<Record<string, unknown>>(input, 'object-first')
  assert.equal(result?.overallSentiment, 0.75)
  assert.deepEqual(result?.hotTopics, ['A', 'B'])
})

test('extractJsonFromText array-first still parses structured arrays', () => {
  const input = `以下是结果：[{"topic":"测试","impactDirection":"利好","impactLevel":"重大","affectedSectors":[],"affectedStocks":[],"timeHorizon":"短期","confidence":0.8}]`
  const result = extractJsonFromText<Array<Record<string, unknown>>>(input, 'array-first')
  assert.equal(result?.length, 1)
  assert.equal(result?.[0]?.topic, '测试')
})

test('llm extraction timeout constants are widened for slow models', () => {
  assert.equal(LLM_CALL_TIMEOUT_MS, 360_000)
  assert.equal(AGENT_FALLBACK_BUDGET_MS, 15 * 60 * 1000)
})

test('llm extraction skips unsupported assigned model and fallback candidates', () => {
  const aiConfig = {
    version: 1,
    updatedAt: '2026-04-08T00:00:00.000Z',
    providers: [
      {
        id: 'opencodego',
        name: 'OpenCodeGo',
        baseUrl: 'https://example.com',
        apiKey: 'key',
        models: ['MiMo-V2-Pro', 'Qwen3-32B'],
        concurrency: 1,
        enabled: true,
        createdAt: '2026-04-08T00:00:00.000Z',
        updatedAt: '2026-04-08T00:00:00.000Z',
      },
      {
        id: 'other',
        name: 'OtherProvider',
        baseUrl: 'https://example.org',
        apiKey: 'key',
        models: ['GLM-5'],
        concurrency: 1,
        enabled: true,
        createdAt: '2026-04-08T00:00:00.000Z',
        updatedAt: '2026-04-08T00:00:00.000Z',
      },
    ],
    experts: [],
    layerAssignments: [],
    extractionAgents: [
      {
        agentId: 'sentiment_analyzer',
        label: '情绪',
        enabled: true,
        assignedModel: {
          providerId: 'opencodego',
          providerName: 'OpenCodeGo',
          modelId: 'MiMo-V2-Pro',
          displayName: 'MiMo-V2-Pro (OpenCodeGo)',
        },
      },
    ],
  }

  const primary = pickPrimaryCandidate('sentiment_analyzer', aiConfig)
  assert.equal(primary?.provider.name, 'OpenCodeGo')
  assert.equal(primary?.modelId, 'Qwen3-32B')

  const fallbacks = buildFallbackCandidates(aiConfig, 'opencodego', 'Qwen3-32B')
  assert.deepEqual(fallbacks.map((candidate) => `${candidate.provider.name}/${candidate.modelId}`), ['OtherProvider/GLM-5'])
  assert.equal(isUnsupportedCandidate(aiConfig.providers[0], 'MiMo-V2-Pro'), true)
})
