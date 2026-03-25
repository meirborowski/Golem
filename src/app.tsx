import React, { useState, useCallback, useMemo } from 'react';
import { AppContextProvider } from './ui/context/app-context.js';
import { BusProvider } from './ui/context/bus-provider.js';
import { ChatView } from './ui/components/chat-view.js';
import { ExtensionRegistry } from './core/extension-registry.js';
import { builtinExtensions } from './extensions/index.js';
import { loadAgent } from './agents/agent-loader.js';
import { createGolemBus } from './bootstrap.js';
import type { AgentConfig } from './agents/agent-types.js';
import { logger } from './utils/logger.js';
import type { ResolvedConfig } from './core/types.js';

interface AppProps {
  config: ResolvedConfig;
}

export function App({ config }: AppProps) {
  // Create and initialize extension registry
  const registry = useMemo(() => {
    const reg = new ExtensionRegistry();
    reg.registerAll(builtinExtensions);
    return reg;
  }, []);

  // Load agent config
  const [agent, setAgent] = useState<AgentConfig>(() => {
    const agentName = config.agent ?? 'default';
    const loaded = loadAgent(agentName, config.cwd);
    if (!loaded) {
      logger.error(`Agent "${agentName}" not found, falling back to default`);
      const fallback = loadAgent('default', config.cwd);
      if (!fallback) {
        throw new Error('Default agent config not found. Ensure src/agents/configs/default.md exists.');
      }
      return fallback;
    }
    return loaded;
  });

  // Create the event bus and subscribers — providers are registered by bootstrap
  const golemBus = useMemo(() => createGolemBus(config, agent, registry), []);

  const { configManager } = golemBus.subscribers;

  // Resolve model via ConfigManager (replaces old provider-registry)
  const [model, setModel] = useState(() => configManager.resolveModel());
  const [modelName, setModelName] = useState(
    () => config.model || configManager.getDefaultModel(config.provider),
  );
  const [provider, setProvider] = useState(config.provider);

  const switchAgent = useCallback((newAgent: AgentConfig) => {
    setAgent(newAgent);
    logger.info(`Switched to agent: ${newAgent.name}`);
  }, []);

  const switchModel = useCallback(
    (newProvider: string, newModel?: string) => {
      const entry = configManager.getProvider(newProvider);
      if (!entry) {
        throw new Error(`Unknown provider "${newProvider}"`);
      }

      const resolvedModelId = newModel || entry.defaultModel;
      const providerConfig = config.providers[newProvider];
      const apiKey = config.apiKey || providerConfig?.apiKey || undefined;

      const newLanguageModel = entry.createModel(resolvedModelId, {
        apiKey,
        baseUrl: providerConfig?.baseUrl,
      });

      setModel(newLanguageModel);
      setModelName(resolvedModelId);
      setProvider(newProvider);

      // Also update the bus's ConfigManager so StreamCoordinator picks it up
      configManager.switchProvider(newProvider, resolvedModelId);
    },
    [config, configManager],
  );

  return (
    <BusProvider bus={golemBus.bus} subscribers={golemBus.subscribers}>
      <AppContextProvider
        config={config}
        registry={registry}
        activeModel={model}
        activeModelName={modelName}
        activeProvider={provider}
        switchModel={switchModel}
        agent={agent}
        switchAgent={switchAgent}
      >
        <ChatView />
      </AppContextProvider>
    </BusProvider>
  );
}
