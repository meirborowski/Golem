import React, { createContext, useContext, useReducer } from 'react';
import type { AppState, AppAction, ResolvedConfig, LanguageModel } from '../../core/types.js';
import type { McpManager } from '../../core/mcp-client.js';

const initialState: AppState = {
  messages: [],
  isStreaming: false,
  error: null,
  pendingApproval: null,
  tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  agentMode: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: 'user', content: action.content, timestamp: Date.now() },
        ],
      };

    case 'ADD_ASSISTANT_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: 'assistant', content: '', timestamp: Date.now() },
        ],
      };

    case 'APPEND_CHUNK': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + action.text };
      }
      return { ...state, messages: msgs };
    }

    case 'ADD_TOOL_CALL': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        const toolCalls = [...(last.toolCalls ?? []), action.toolCall];
        msgs[msgs.length - 1] = { ...last, toolCalls };
      }
      return { ...state, messages: msgs };
    }

    case 'UPDATE_TOOL_CALL': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant' && last.toolCalls) {
        const toolCalls = last.toolCalls.map((tc) =>
          tc.id === action.toolCallId ? { ...tc, ...action.update } : tc,
        );
        msgs[msgs.length - 1] = { ...last, toolCalls };
      }
      return { ...state, messages: msgs };
    }

    case 'START_STREAMING':
      return { ...state, isStreaming: true, error: null };

    case 'FINISH_STREAMING':
      return { ...state, isStreaming: false, tokenUsage: action.usage };

    case 'SET_ERROR':
      return { ...state, isStreaming: false, error: action.error };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'SET_PENDING_APPROVAL':
      return { ...state, pendingApproval: action.approval };

    case 'CLEAR_MESSAGES':
      return {
        ...state,
        messages: [],
        error: null,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };

    case 'ADD_SYSTEM_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: 'system', content: action.content, timestamp: Date.now() },
        ],
      };

    case 'LOAD_SESSION':
      return {
        ...state,
        messages: action.messages,
        tokenUsage: action.tokenUsage,
        error: null,
      };

    case 'START_AGENT_MODE':
      return {
        ...state,
        agentMode: {
          task: action.task,
          currentTurn: 0,
          maxTurns: action.maxTurns,
          status: 'running',
          toolActivity: [],
        },
      };

    case 'AGENT_TURN_COMPLETE':
      return {
        ...state,
        agentMode: state.agentMode
          ? { ...state.agentMode, currentTurn: action.turn, toolActivity: [] }
          : null,
      };

    case 'STOP_AGENT_MODE':
      return {
        ...state,
        agentMode: state.agentMode
          ? { ...state.agentMode, status: action.status }
          : null,
      };

    case 'AGENT_TOOL_START': {
      if (!state.agentMode) return state;
      return {
        ...state,
        agentMode: {
          ...state.agentMode,
          toolActivity: [
            ...state.agentMode.toolActivity,
            { toolName: action.toolName, argsPreview: action.argsPreview, status: 'running' as const },
          ],
        },
      };
    }

    case 'AGENT_TOOL_DONE': {
      if (!state.agentMode) return state;
      const toolActivity = [...state.agentMode.toolActivity];
      // Update the last matching running tool
      for (let i = toolActivity.length - 1; i >= 0; i--) {
        if (toolActivity[i].toolName === action.toolName && toolActivity[i].status === 'running') {
          toolActivity[i] = { ...toolActivity[i], status: action.status };
          break;
        }
      }
      return {
        ...state,
        agentMode: { ...state.agentMode, toolActivity },
      };
    }

    case 'SET_AGENT_FINAL_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            role: 'assistant' as const,
            content: action.content,
            toolCalls: action.toolCalls,
            timestamp: Date.now(),
          },
        ],
      };

    default:
      return state;
  }
}

// ── Context ─────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  config: ResolvedConfig;
  activeModel: LanguageModel;
  activeModelName: string;
  activeProvider: string;
  switchModel: (provider: string, model?: string) => void;
  mcpManager: McpManager | null;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppContextProvider({
  children,
  config,
  activeModel,
  activeModelName,
  activeProvider,
  switchModel,
  mcpManager,
}: {
  children: React.ReactNode;
  config: ResolvedConfig;
  activeModel: LanguageModel;
  activeModelName: string;
  activeProvider: string;
  switchModel: (provider: string, model?: string) => void;
  mcpManager: McpManager | null;
}) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider
      value={{ state, dispatch, config, activeModel, activeModelName, activeProvider, switchModel, mcpManager }}
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
