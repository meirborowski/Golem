import React from 'react';
import { AppContextProvider } from './ui/context/app-context.js';
import { ChatView } from './ui/components/chat-view.js';
import { resolveModel, getDefaultModel } from './core/provider-registry.js';
import type { ResolvedConfig } from './core/types.js';

interface AppProps {
  config: ResolvedConfig;
}

export function App({ config }: AppProps) {
  const model = resolveModel(config);
  const modelName = config.model || getDefaultModel(config.provider);

  return (
    <AppContextProvider config={config}>
      <ChatView model={model} modelName={modelName} />
    </AppContextProvider>
  );
}
