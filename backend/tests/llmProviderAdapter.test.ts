import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAnthropicMessagesUrl,
  isKimiCodingModel,
  normalizeUsage,
} from '../src/services/stock-analysis/llm-provider-adapter'

test('isKimiCodingModel only matches kimi coding endpoint and model', () => {
  const kimiProvider = {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.kimi.com/coding/v1',
    apiKey: 'key',
    models: ['kimi-for-coding'],
    concurrency: 1,
    enabled: true,
    createdAt: '2026-04-08T00:00:00.000Z',
    updatedAt: '2026-04-08T00:00:00.000Z',
  }
  const openAiProvider = {
    ...kimiProvider,
    baseUrl: 'https://api.example.com/v1',
  }

  assert.equal(isKimiCodingModel(kimiProvider, 'kimi-for-coding'), true)
  assert.equal(isKimiCodingModel(kimiProvider, 'other-model'), false)
  assert.equal(isKimiCodingModel(openAiProvider, 'kimi-for-coding'), false)
})

test('buildAnthropicMessagesUrl appends /v1/messages correctly', () => {
  assert.equal(
    buildAnthropicMessagesUrl('https://api.kimi.com/coding'),
    'https://api.kimi.com/coding/v1/messages',
  )
  assert.equal(
    buildAnthropicMessagesUrl('https://api.kimi.com/coding/v1/'),
    'https://api.kimi.com/coding/v1/messages',
  )
})

test('normalizeUsage maps anthropic usage into shared token fields', () => {
  assert.deepEqual(normalizeUsage({ input_tokens: 123, output_tokens: 45 }), {
    prompt_tokens: 123,
    completion_tokens: 45,
    total_tokens: 168,
  })
  assert.deepEqual(normalizeUsage({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }), {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
  })
})
