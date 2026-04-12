import fs from 'fs/promises';
import path from 'path';

interface OpenClawProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function getModelsConfigPath() {
  return path.join(process.env.HOME || require('os').homedir(), '.openclaw', 'agents', 'main', 'agent', 'models.json');
}

async function readProviderConfig(): Promise<OpenClawProviderConfig> {
  const raw = await fs.readFile(getModelsConfigPath(), 'utf8');
  const json = JSON.parse(raw) as {
    providers?: Record<string, { baseUrl?: string; apiKey?: string; models?: Array<{ id?: string }> }>;
  };

  const provider = json.providers?.modelstudio;
  const model = provider?.models?.[0]?.id;
  if (!provider?.baseUrl || !provider.apiKey || !model) {
    throw new Error('OpenClaw model provider config is incomplete');
  }

  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model,
  };
}

export async function requestOpenClawChatCompletion(messages: ChatMessage[], options?: { maxTokens?: number; temperature?: number }) {
  const provider = await readProviderConfig();
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: options?.maxTokens ?? 4000,
      temperature: options?.temperature ?? 0.2,
    }),
  });

  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OpenClaw translate response is not JSON: ${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(json?.error?.message || json?.message || `OpenClaw translate failed: ${response.status}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenClaw translate returned empty content');
  }

  return content.trim();
}
