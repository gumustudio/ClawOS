import type { StockAnalysisAIProvider } from './types'

interface ProviderMessage {
  role: string
  content: string
}

interface ProviderCallOptions {
  provider: StockAnalysisAIProvider
  modelId: string
  messages: ProviderMessage[]
  maxTokens: number
  temperature: number
  userAgent: string
  timeoutMs: number
}

interface ProviderUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface ProviderTextResponse {
  content: string
  reasoningContent: string | null
  usage?: ProviderUsage
  latencyMs: number
}

export function isKimiCodingModel(provider: StockAnalysisAIProvider, modelId: string): boolean {
  return provider.baseUrl.includes('api.kimi.com/coding') && modelId === 'kimi-for-coding'
}

export function buildAnthropicMessagesUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  return normalizedBaseUrl.endsWith('/v1')
    ? `${normalizedBaseUrl}/messages`
    : `${normalizedBaseUrl}/v1/messages`
}

export function normalizeUsage(usage?: {
  input_tokens?: number
  output_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}): ProviderUsage | undefined {
  if (!usage) return undefined

  const promptTokens = usage.prompt_tokens ?? usage.input_tokens
  const completionTokens = usage.completion_tokens ?? usage.output_tokens
  const totalTokens = usage.total_tokens ?? ((promptTokens ?? 0) + (completionTokens ?? 0))

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  }
}

export async function callProviderText({
  provider,
  modelId,
  messages,
  maxTokens,
  temperature,
  userAgent,
  timeoutMs,
}: ProviderCallOptions): Promise<ProviderTextResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()

  try {
    if (isKimiCodingModel(provider, modelId)) {
      const systemMessages = messages.filter((message) => message.role === 'system').map((message) => message.content)
      const anthropicMessages = messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        }))

      const response = await fetch(buildAnthropicMessagesUrl(provider.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
          Authorization: `Bearer ${provider.apiKey}`,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelId,
          system: systemMessages.join('\n\n') || undefined,
          messages: anthropicMessages,
          max_tokens: maxTokens,
          temperature,
        }),
        signal: controller.signal,
      })

      const latencyMs = Date.now() - start
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown')
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`)
      }

      const data = await response.json() as {
        content?: Array<{ type?: string; text?: string }>
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
      }
      const content = data.content
        ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text?.trim() ?? '')
        .filter(Boolean)
        .join('\n') ?? ''

      return {
        content,
        reasoningContent: null,
        usage: normalizeUsage(data.usage),
        latencyMs,
      }
    }

    const baseUrl = provider.baseUrl.replace(/\/+$/, '')
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    })

    const latencyMs = Date.now() - start
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown')
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`)
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      reasoningContent: data.choices?.[0]?.message?.reasoning_content ?? null,
      usage: normalizeUsage(data.usage),
      latencyMs,
    }
  } finally {
    clearTimeout(timeout)
  }
}
