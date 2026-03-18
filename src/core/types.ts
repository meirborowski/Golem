import type { CoreMessage, LanguageModel } from 'ai';

// ── Config ──────────────────────────────────────────────────────────────────

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface GolemConfig {
  provider: string;
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  debug?: boolean;
  providers?: Record<string, ProviderConfig>;
}

export interface ResolvedConfig {
  provider: string;
  model: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  debug: boolean;
  cwd: string;
  providers: Record<string, ProviderConfig>;
}

// ── Provider ────────────────────────────────────────────────────────────────

export interface ProviderEntry {
  name: string;
  createModel: (modelId: string, options?: ProviderConfig) => LanguageModel;
  defaultModel: string;
  envKeyName: string | null;
}

// ── Stream Events ───────────────────────────────────────────────────────────

export type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolName: string; toolCallId: string; args: unknown }
  | { type: 'tool-result'; toolName: string; toolCallId: string; result: unknown }
  | { type: 'finish'; usage: TokenUsage }
  | { type: 'error'; error: Error };

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ── Messages ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallInfo[];
  timestamp: number;
}

export interface ToolCallInfo {
  id: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'error';
}

// ── App State ───────────────────────────────────────────────────────────────

export interface AppState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  pendingApproval: PendingApproval | null;
  tokenUsage: TokenUsage;
}

export interface PendingApproval {
  toolCallId: string;
  toolName: string;
  args: unknown;
  resolve: (approved: boolean) => void;
}

export type AppAction =
  | { type: 'ADD_USER_MESSAGE'; content: string }
  | { type: 'ADD_ASSISTANT_MESSAGE' }
  | { type: 'APPEND_CHUNK'; text: string }
  | { type: 'ADD_TOOL_CALL'; toolCall: ToolCallInfo }
  | { type: 'UPDATE_TOOL_CALL'; toolCallId: string; update: Partial<ToolCallInfo> }
  | { type: 'FINISH_STREAMING'; usage: TokenUsage }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_PENDING_APPROVAL'; approval: PendingApproval | null }
  | { type: 'START_STREAMING' };

// ── Re-export ───────────────────────────────────────────────────────────────

export type { CoreMessage, LanguageModel };
