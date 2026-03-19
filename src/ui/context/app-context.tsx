import React, { createContext, useContext, useReducer } from 'react';
import type { AppState, AppAction, ResolvedConfig, TokenUsage } from '../../core/types.js';

const initialState: AppState = {
  messages: [],
  isStreaming: false,
  error: null,
  pendingApproval: null,
  tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
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

    default:
      return state;
  }
}

// ── Context ─────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  config: ResolvedConfig;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppContextProvider({
  children,
  config,
}: {
  children: React.ReactNode;
  config: ResolvedConfig;
}) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch, config }}>{children}</AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within AppContextProvider');
  }
  return ctx;
}
