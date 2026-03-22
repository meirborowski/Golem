import type { ModelMessage, LanguageModel } from 'ai';

// ── Config ──────────────────────────────────────────────────────────────────

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface McpServerStdio {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpServerHttp {
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = McpServerStdio | McpServerHttp;

export interface GolemConfig {
  provider: string;
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  contextWindow?: number;
  temperature?: number;
  debug?: boolean;
  providers?: Record<string, ProviderConfig>;
  mcpServers?: Record<string, McpServerConfig>;
}

export interface ResolvedConfig {
  provider: string;
  model: string;
  apiKey?: string;
  maxTokens: number;
  contextWindow: number;
  temperature: number | undefined;
  debug: boolean;
  cwd: string;
  providers: Record<string, ProviderConfig>;
  mcpServers: Record<string, McpServerConfig>;
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

// ── Agent Mode ──────────────────────────────────────────────────────────────

export interface AgentToolActivity {
  toolName: string;
  argsPreview: string;
  status: 'running' | 'completed' | 'error';
}

export interface AgentModeState {
  task: string;
  currentTurn: number;
  maxTurns: number;
  status: 'running' | 'completed' | 'cancelled' | 'error';
  toolActivity: AgentToolActivity[];
  totalToolsExecuted: number;
}

// ── App State ───────────────────────────────────────────────────────────────

export interface AppState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  pendingApproval: PendingApproval | null;
  tokenUsage: TokenUsage;
  agentMode: AgentModeState | null;
}

export interface PendingApproval {
  toolCallId: string;
  toolName: string;
  args: unknown;
  resolve: (approved: boolean) => void;
  mcpServer?: string;
}

export type ApprovalCallback = (
  toolName: string,
  toolCallId: string,
  args: unknown,
) => Promise<boolean>;

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
  | { type: 'START_STREAMING' }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'ADD_SYSTEM_MESSAGE'; content: string }
  | { type: 'LOAD_SESSION'; messages: ChatMessage[]; tokenUsage: TokenUsage }
  | { type: 'START_AGENT_MODE'; task: string; maxTurns: number }
  | { type: 'AGENT_TURN_COMPLETE'; turn: number }
  | { type: 'STOP_AGENT_MODE'; status: 'completed' | 'cancelled' | 'error' }
  | { type: 'AGENT_TOOL_START'; toolName: string; argsPreview: string }
  | { type: 'AGENT_TOOL_DONE'; toolName: string; status: 'completed' | 'error' }
  | { type: 'SET_AGENT_FINAL_MESSAGE'; content: string; toolCalls?: ToolCallInfo[] };

// ── Turn Result ─────────────────────────────────────────────────────────────

export interface TurnResult {
  hadToolCalls: boolean;
  agentDoneCalled: boolean;
  hadTextOutput: boolean;
  errorCount: number;
  /** Accumulated text from this turn (populated in background mode). */
  finalText: string;
  /** Tool calls executed during this turn (populated in background mode). */
  toolCalls: ToolCallInfo[];
  /** Last error message from this turn (populated in background mode). */
  lastError: string;
}

export interface SendMessageOptions {
  /** If true, don't show this message in the UI as a user message. */
  silent?: boolean;
  /** If true, suppress text-delta dispatches to the UI (still tracked in TurnResult). */
  suppressText?: boolean;
  /** If true, run in background: skip all UI dispatches, collect results in TurnResult. */
  background?: boolean;
}

// ── Session ────────────────────────────────────────────────────────────────

export interface SavedSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  provider: string;
  model: string;
  cwd: string;
  messages: ChatMessage[];
  tokenUsage: TokenUsage;
}

// ── Re-export ───────────────────────────────────────────────────────────────

export type { ModelMessage, LanguageModel };
/** @deprecated Use ModelMessage */
export type CoreMessage = ModelMessage;
