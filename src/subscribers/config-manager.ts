/**
 * ConfigManager subscriber — Holds resolved config and provider entries.
 *
 * Listens: config:provider-registered, command:executed (for /model, /provider)
 * Emits:   config:changed, config:provider-switched
 */

import type { EventBus, Unsubscribe } from '../bus/event-bus.js';
import { createEvent } from '../bus/helpers.js';
import type { ResolvedConfig, ProviderEntry, LanguageModel, ProviderConfig } from '../core/types.js';

export class ConfigManager {
  private providers = new Map<string, ProviderEntry>();
  private disposers: Unsubscribe[] = [];

  constructor(
    private bus: EventBus,
    private config: ResolvedConfig,
  ) {
    this.disposers.push(
      bus.on('config:provider-registered', (e) => {
        this.providers.set(e.providerName, {
          name: e.providerName,
          defaultModel: e.defaultModel,
          // The actual createModel/envKeyName are set via registerProvider()
          createModel: this.providers.get(e.providerName)?.createModel ?? (() => { throw new Error(`Provider ${e.providerName} not fully registered`); }),
          envKeyName: this.providers.get(e.providerName)?.envKeyName ?? null,
        });
      }),
    );
  }

  /** Register a provider entry directly (called by extensions during activation). */
  registerProvider(entry: ProviderEntry): void {
    this.providers.set(entry.name, entry);
  }

  /** Get the current resolved config. */
  getConfig(): ResolvedConfig {
    return this.config;
  }

  /** Update a config value and emit config:changed. */
  updateConfig<K extends keyof ResolvedConfig>(key: K, value: ResolvedConfig[K]): void {
    this.config = { ...this.config, [key]: value };
    void this.bus.emit(createEvent('config:changed', { key: key as string, value }));
  }

  /** Resolve a LanguageModel from the current config. */
  resolveModel(overrideProvider?: string, overrideModel?: string): LanguageModel {
    const providerName = overrideProvider ?? this.config.provider;
    const entry = this.providers.get(providerName);
    if (!entry) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new Error(`Unknown provider "${providerName}". Available: ${available}`);
    }

    const modelId = overrideModel ?? (this.config.model || entry.defaultModel);
    const providerConfig = this.config.providers[providerName];

    // Resolve API key: CLI config > provider config > env
    const apiKey = this.config.apiKey || providerConfig?.apiKey;

    return entry.createModel(modelId, {
      ...(apiKey && { apiKey }),
      baseUrl: providerConfig?.baseUrl,
    });
  }

  /** Switch provider and/or model. Emits config:provider-switched. */
  switchProvider(provider: string, model?: string): void {
    const entry = this.providers.get(provider);
    if (!entry) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new Error(`Unknown provider "${provider}". Available: ${available}`);
    }

    const resolvedModel = model || entry.defaultModel;
    this.config = { ...this.config, provider, model: resolvedModel };

    void this.bus.emit(createEvent('config:provider-switched', {
      provider,
      model: resolvedModel,
    }));
  }

  /** Get the default model for a provider. */
  getDefaultModel(providerName: string): string {
    return this.providers.get(providerName)?.defaultModel ?? 'unknown';
  }

  /** List available provider names. */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /** Get a provider entry by name. */
  getProvider(name: string): ProviderEntry | undefined {
    return this.providers.get(name);
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
  }
}
