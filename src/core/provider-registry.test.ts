import { describe, it, expect, beforeAll } from 'vitest';
import { ConfigManager } from '../subscribers/config-manager.js';
import { GolemEventBus } from '../bus/event-bus.js';
import { builtinProvidersExtension } from '../extensions/builtin-providers.js';
import type { ResolvedConfig } from './types.js';

const testConfig: ResolvedConfig = {
  provider: 'anthropic',
  model: '',
  maxTokens: 4096,
  contextWindow: 128000,
  temperature: undefined,
  debug: false,
  cwd: process.cwd(),
  providers: {},
  mcpServers: {},
  approval: {},
};

let configManager: ConfigManager;

beforeAll(() => {
  const bus = new GolemEventBus();
  configManager = new ConfigManager(bus, testConfig);

  // Register providers from the builtin extension
  const providers = builtinProvidersExtension.providers!();
  for (const [_name, entry] of Object.entries(providers)) {
    configManager.registerProvider(entry);
  }
});

describe('ConfigManager (replaces provider-registry)', () => {
  describe('listProviders', () => {
    it('returns all registered provider names', () => {
      const providers = configManager.listProviders();
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('google');
      expect(providers).toContain('ollama');
      expect(providers).toHaveLength(4);
    });
  });

  describe('getProvider', () => {
    it('returns provider entry for known providers', () => {
      const anthropic = configManager.getProvider('anthropic');
      expect(anthropic).toBeDefined();
      expect(anthropic!.name).toBe('anthropic');
      expect(anthropic!.defaultModel).toBeTruthy();
    });

    it('returns undefined for unknown provider', () => {
      expect(configManager.getProvider('nonexistent')).toBeUndefined();
    });
  });

  describe('getDefaultModel', () => {
    it('returns correct defaults for each provider', () => {
      expect(configManager.getDefaultModel('anthropic')).toContain('claude');
      expect(configManager.getDefaultModel('openai')).toBe('gpt-4o');
      expect(configManager.getDefaultModel('google')).toContain('gemini');
      expect(configManager.getDefaultModel('ollama')).toBe('llama3.1');
    });

    it('returns "unknown" for non-existent provider', () => {
      expect(configManager.getDefaultModel('fake')).toBe('unknown');
    });
  });
});
