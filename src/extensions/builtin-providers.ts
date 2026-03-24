import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import type { LanguageModel, ProviderConfig } from '../core/types.js';
import type { GolemExtension } from '../core/extension.js';

/**
 * Built-in providers extension. Registers Anthropic, OpenAI, Google, and Ollama.
 */
export const builtinProvidersExtension: GolemExtension = {
  name: 'builtin-providers',
  providers: () => ({
    anthropic: {
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
    },

    openai: {
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
    },

    google: {
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
    },

    ollama: {
      name: 'ollama',
      defaultModel: 'llama3.1',
      envKeyName: null,
      createModel: (modelId: string, options?: ProviderConfig): LanguageModel => {
        const provider = createOllama({
          baseURL: options?.baseUrl || 'http://localhost:11434/api',
        });
        return provider(modelId) as unknown as LanguageModel;
      },
    },
  }),
};
