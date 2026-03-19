import React, { useState, useCallback } from 'react';
import { AppContextProvider } from './ui/context/app-context.js';
import { ChatView } from './ui/components/chat-view.js';
import { resolveModel, getDefaultModel, getProvider } from './core/provider-registry.js';
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
    >
      <ChatView />
    </AppContextProvider>
  );
}
