import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { AppContextProvider } from './ui/context/app-context.js';
import { BusProvider } from './ui/context/bus-provider.js';
import { ChatView } from './ui/components/chat-view.js';
import { resolveModel, getDefaultModel, getProvider, initProviders } from './core/provider-registry.js';
import { createMcpManager, type McpManager } from './core/mcp-client.js';
import { setActiveMcpManager } from './core/mcp-lifecycle.js';
import { ExtensionRegistry } from './core/extension-registry.js';
import { builtinExtensions } from './extensions/index.js';
import { loadAgent } from './agents/agent-loader.js';
import { createGolemBus, type GolemBus } from './bootstrap.js';
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
    // Initialize provider registry from extensions
    initProviders(reg);
    return reg;
  }, []);

  const [model, setModel] = useState(() => resolveModel(config));
  const [modelName, setModelName] = useState(
    () => config.model || getDefaultModel(config.provider),
  );
  const [provider, setProvider] = useState(config.provider);
  const [mcpManager, setMcpManager] = useState<McpManager | null>(null);

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

  const switchAgent = useCallback((newAgent: AgentConfig) => {
    setAgent(newAgent);
    logger.info(`Switched to agent: ${newAgent.name}`);
  }, []);

  // Create the event bus and subscribers (new architecture, coexists with old)
  const golemBus = useMemo(() => createGolemBus(config, agent, registry), []);

  // Initialize MCP servers in background
  useEffect(() => {
    const serverCount = Object.keys(config.mcpServers).length;
    if (serverCount === 0) return;

    let cancelled = false;
    logger.info(`Connecting to ${serverCount} MCP server(s)...`);

    createMcpManager(config.mcpServers, undefined, config.approval, config).then((manager) => {
      if (cancelled) {
        manager.close();
        return;
      }
      setMcpManager(manager);
      setActiveMcpManager(manager);
      logger.info(`MCP ready: ${Object.keys(manager.tools).length} tool(s) available`);
    });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchModel = useCallback(
    (newProvider: string, newModel?: string) => {
      const entry = getProvider(newProvider);
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
    },
    [config],
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
        mcpManager={mcpManager}
        agent={agent}
        switchAgent={switchAgent}
      >
        <ChatView />
      </AppContextProvider>
    </BusProvider>
  );
}
