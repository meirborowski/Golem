/**
 * AppContext — Provides display-only values to the component tree.
 *
 * After the bus migration, this context no longer manages state via useReducer.
 * It simply passes through config, registry, model/provider names, and callbacks
 * that the UI needs for display and slash command handling.
 */

import React, { createContext, useContext } from 'react';
import type { ResolvedConfig, LanguageModel } from '../../core/types.js';
import type { McpManager } from '../../core/mcp-client.js';
import type { AgentConfig } from '../../agents/agent-types.js';
import type { ExtensionRegistry } from '../../core/extension-registry.js';

interface AppContextValue {
  config: ResolvedConfig;
  registry: ExtensionRegistry;
  activeModel: LanguageModel;
  activeModelName: string;
  activeProvider: string;
  switchModel: (provider: string, model?: string) => void;
  mcpManager: McpManager | null;
  agent: AgentConfig;
  switchAgent: (agent: AgentConfig) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppContextProvider({
  children,
  config,
  registry,
  activeModel,
  activeModelName,
  activeProvider,
  switchModel,
  mcpManager,
  agent,
  switchAgent,
}: {
  children: React.ReactNode;
  config: ResolvedConfig;
  registry: ExtensionRegistry;
  activeModel: LanguageModel;
  activeModelName: string;
  activeProvider: string;
  switchModel: (provider: string, model?: string) => void;
  mcpManager: McpManager | null;
  agent: AgentConfig;
  switchAgent: (agent: AgentConfig) => void;
}) {
  return (
    <AppContext.Provider
      value={{ config, registry, activeModel, activeModelName, activeProvider, switchModel, mcpManager, agent, switchAgent }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within AppContextProvider');
  }
  return ctx;
}
