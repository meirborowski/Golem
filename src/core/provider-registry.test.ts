import { describe, it, expect, beforeAll } from 'vitest';
import { getProvider, listProviders, getDefaultModel, initProviders } from './provider-registry.js';
import { ExtensionRegistry } from './extension-registry.js';
import { builtinProvidersExtension } from '../extensions/builtin-providers.js';

beforeAll(() => {
  const registry = new ExtensionRegistry();
  registry.register(builtinProvidersExtension);
  initProviders(registry);
});

describe('provider-registry', () => {
  describe('listProviders', () => {
    it('returns all registered provider names', () => {
      const providers = listProviders();
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('google');
      expect(providers).toContain('ollama');
      expect(providers).toHaveLength(4);
    });
  });

  describe('getProvider', () => {
    it('returns provider entry for known providers', () => {
      const anthropic = getProvider('anthropic');
      expect(anthropic).toBeDefined();
      expect(anthropic!.name).toBe('anthropic');
      expect(anthropic!.defaultModel).toBeTruthy();
    });

    it('returns undefined for unknown provider', () => {
      expect(getProvider('nonexistent')).toBeUndefined();
    });
  });

  describe('getDefaultModel', () => {
    it('returns correct defaults for each provider', () => {
      expect(getDefaultModel('anthropic')).toContain('claude');
      expect(getDefaultModel('openai')).toBe('gpt-4o');
      expect(getDefaultModel('google')).toContain('gemini');
      expect(getDefaultModel('ollama')).toBe('llama3.1');
    });

    it('returns "unknown" for non-existent provider', () => {
      expect(getDefaultModel('fake')).toBe('unknown');
    });
  });
});
