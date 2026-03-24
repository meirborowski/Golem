import type { LanguageModel, ProviderEntry, ProviderConfig, ResolvedConfig } from './types.js';
import type { ExtensionRegistry } from './extension-registry.js';

// ── Provider Store ──────────────────────────────────────────────────────────

let providers: Map<string, ProviderEntry> = new Map();

/**
 * Initialize the provider registry from an extension registry.
 * Call once at app startup before resolving models.
 */
export function initProviders(registry: ExtensionRegistry): void {
  providers = registry.collectProviders();
}

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
