import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import type { LanguageModel, ProviderEntry, ProviderConfig, ResolvedConfig } from './types.js';

const providers: Map<string, ProviderEntry> = new Map();

// ── Register Built-in Providers ─────────────────────────────────────────────

providers.set('anthropic', {
  name: 'anthropic',
  defaultModel: 'claude-sonnet-4-20250514',
  envKeyName: 'ANTHROPIC_API_KEY',
  createModel: (modelId: string, options?: ProviderConfig): LanguageModel => {
    const key = options?.apiKey || process.env['ANTHROPIC_API_KEY'];
    if (!key) throw new Error('Anthropic API key not found. Set ANTHROPIC_API_KEY or pass it via config.');
    const provider = createAnthropic({
      apiKey: key,
      ...(options?.baseUrl && { baseURL: options.baseUrl }),
    });
    return provider(modelId);
  },
});

providers.set('openai', {
  name: 'openai',
  defaultModel: 'gpt-4o',
  envKeyName: 'OPENAI_API_KEY',
  createModel: (modelId: string, options?: ProviderConfig): LanguageModel => {
    const key = options?.apiKey || process.env['OPENAI_API_KEY'];
    if (!key) throw new Error('OpenAI API key not found. Set OPENAI_API_KEY or pass it via config.');
    const provider = createOpenAI({
      apiKey: key,
      ...(options?.baseUrl && { baseURL: options.baseUrl }),
    });
    return provider(modelId);
  },
});

providers.set('google', {
  name: 'google',
  defaultModel: 'gemini-2.0-flash',
  envKeyName: 'GOOGLE_GENERATIVE_AI_API_KEY',
  createModel: (modelId: string, options?: ProviderConfig): LanguageModel => {
    const key = options?.apiKey || process.env['GOOGLE_GENERATIVE_AI_API_KEY'];
    if (!key) throw new Error('Google AI API key not found. Set GOOGLE_GENERATIVE_AI_API_KEY or pass it via config.');
    const provider = createGoogleGenerativeAI({
      apiKey: key,
      ...(options?.baseUrl && { baseURL: options.baseUrl }),
    });
    return provider(modelId);
  },
});

providers.set('ollama', {
  name: 'ollama',
  defaultModel: 'llama3.1',
  envKeyName: null,
  createModel: (modelId: string, options?: ProviderConfig): LanguageModel => {
    const provider = createOllama({
      baseURL: options?.baseUrl || 'http://localhost:11434/api',
    });
    // ollama-ai-provider returns LanguageModelV1; cast for SDK v6 compat
    return provider(modelId) as unknown as LanguageModel;
  },
});

// ── Public API ──────────────────────────────────────────────────────────────

export function getProvider(name: string): ProviderEntry | undefined {
  return providers.get(name);
}

export function listProviders(): string[] {
  return Array.from(providers.keys());
}

export function resolveModel(config: ResolvedConfig): LanguageModel {
  const entry = providers.get(config.provider);
  if (!entry) {
    const available = listProviders().join(', ');
    throw new Error(`Unknown provider "${config.provider}". Available: ${available}`);
  }

  const modelId = config.model || entry.defaultModel;
  const providerConfig = config.providers[config.provider];

  // Resolve API key: CLI config > provider config > env
  const apiKey = config.apiKey || providerConfig?.apiKey;

  return entry.createModel(modelId, {
    ...(apiKey && { apiKey }),
    baseUrl: providerConfig?.baseUrl,
  });
}

export function getDefaultModel(providerName: string): string {
  const entry = providers.get(providerName);
  return entry?.defaultModel ?? 'unknown';
}
