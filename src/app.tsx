import React, { useState, useCallback, useEffect } from 'react';
import { AppContextProvider } from './ui/context/app-context.js';
import { ChatView } from './ui/components/chat-view.js';
import { resolveModel, getDefaultModel, getProvider } from './core/provider-registry.js';
import { createMcpManager, type McpManager } from './core/mcp-client.js';
import { setActiveMcpManager } from './core/mcp-lifecycle.js';
import { logger } from './utils/logger.js';
import type { ResolvedConfig } from './core/types.js';

interface AppProps {
  config: ResolvedConfig;
}

export function App({ config }: AppProps) {
  const [model, setModel] = useState(() => resolveModel(config));
  const [modelName, setModelName] = useState(
    () => config.model || getDefaultModel(config.provider),
  );
  const [provider, setProvider] = useState(config.provider);
  const [mcpManager, setMcpManager] = useState<McpManager | null>(null);

  // Initialize MCP servers in background
  useEffect(() => {
    const serverCount = Object.keys(config.mcpServers).length;
    if (serverCount === 0) return;

    let cancelled = false;
    logger.info(`Connecting to ${serverCount} MCP server(s)...`);

    createMcpManager(config.mcpServers).then((manager) => {
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
    <AppContextProvider
      config={config}
      activeModel={model}
      activeModelName={modelName}
      activeProvider={provider}
      switchModel={switchModel}
      mcpManager={mcpManager}
    >
      <ChatView />
    </AppContextProvider>
  );
}
