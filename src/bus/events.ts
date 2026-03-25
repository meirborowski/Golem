/**
 * Golem Event Bus — Event Type System
 *
 * All events form a single discriminated union keyed on `type`, grouped by
 * domain prefix. Every event carries `id` (uuid) and `timestamp`.
 */

import type {
  ChatMessage,
  TokenUsage,
  ToolCallInfo,
  AgentTodoItem,
  SendMessageOptions,
} from '../core/types.js';

// ── Base ────────────────────────────────────────────────────────────────────

export interface EventBase {
  /** Unique event ID (crypto.randomUUID). */
  id: string;
  /** Millisecond timestamp (Date.now). */
  timestamp: number;
}

// ── Stream Domain ───────────────────────────────────────────────────────────

export interface StreamRequestedEvent extends EventBase {
  type: 'stream:requested';
  userMessage: string;
  options: SendMessageOptions;
}

export interface StreamStartedEvent extends EventBase {
  type: 'stream:started';
  /** Ties back to the stream:requested event id. */
  requestId: string;
}

export interface StreamTextDeltaEvent extends EventBase {
  type: 'stream:text-delta';
  requestId: string;
  text: string;
}

export interface StreamFinishedEvent extends EventBase {
  type: 'stream:finished';
  requestId: string;
  usage: TokenUsage;
  /** Accumulated full text from this stream. */
  fullText: string;
  /** Tool calls executed during this stream. */
  toolCalls: ToolCallInfo[];
}

export interface StreamErrorEvent extends EventBase {
  type: 'stream:error';
  requestId: string;
  error: string;
}

// ── Tool Domain ─────────────────────────────────────────────────────────────

export interface ToolRegisteredEvent extends EventBase {
  type: 'tool:registered';
  toolName: string;
  source: 'builtin' | 'mcp' | 'extension';
  description: string;
  /** If source is 'mcp', the server name. */
  mcpServer?: string;
}

export interface ToolUnregisteredEvent extends EventBase {
  type: 'tool:unregistered';
  toolName: string;
}

export interface ToolCallRequestedEvent extends EventBase {
  type: 'tool:call-requested';
  requestId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolCallStartedEvent extends EventBase {
  type: 'tool:call-started';
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolCallCompletedEvent extends EventBase {
  type: 'tool:call-completed';
  toolCallId: string;
  toolName: string;
  result: unknown;
  durationMs: number;
  isError: boolean;
}

// ── Approval Domain ─────────────────────────────────────────────────────────

export interface ApprovalRequestedEvent extends EventBase {
  type: 'approval:requested';
  toolCallId: string;
  toolName: string;
  args: unknown;
  mcpServer?: string;
}

export interface ApprovalResolvedEvent extends EventBase {
  type: 'approval:resolved';
  toolCallId: string;
  approved: boolean;
}

// ── Agent Domain ────────────────────────────────────────────────────────────

export interface AgentStartedEvent extends EventBase {
  type: 'agent:started';
  task: string;
  agentName: string;
  maxTurns: number;
}

export interface AgentTurnCompletedEvent extends EventBase {
  type: 'agent:turn-completed';
  turn: number;
  hadToolCalls: boolean;
  hadTextOutput: boolean;
  agentDoneCalled: boolean;
  errorCount: number;
}

export interface AgentFinishedEvent extends EventBase {
  type: 'agent:finished';
  status: 'completed' | 'cancelled' | 'error';
  finalText: string;
  turnsUsed: number;
  toolCallCount: number;
}

export interface AgentChainPushEvent extends EventBase {
  type: 'agent:chain-push';
  agentName: string;
  depth: number;
}

export interface AgentChainPopEvent extends EventBase {
  type: 'agent:chain-pop';
  agentName: string;
  depth: number;
}

export interface AgentTodosUpdatedEvent extends EventBase {
  type: 'agent:todos-updated';
  todos: AgentTodoItem[];
}

// ── MCP Domain ──────────────────────────────────────────────────────────────

export interface McpConnectingEvent extends EventBase {
  type: 'mcp:connecting';
  serverName: string;
}

export interface McpConnectedEvent extends EventBase {
  type: 'mcp:connected';
  serverName: string;
  toolCount: number;
}

export interface McpErrorEvent extends EventBase {
  type: 'mcp:error';
  serverName: string;
  error: string;
}

export interface McpDisconnectedEvent extends EventBase {
  type: 'mcp:disconnected';
  serverName: string;
}

// ── History Domain ──────────────────────────────────────────────────────────

export interface HistoryMessageAddedEvent extends EventBase {
  type: 'history:message-added';
  message: ChatMessage;
}

export interface HistoryTruncatedEvent extends EventBase {
  type: 'history:truncated';
  droppedCount: number;
}

export interface HistoryClearedEvent extends EventBase {
  type: 'history:cleared';
}

// ── Session Domain ──────────────────────────────────────────────────────────

export interface SessionSavedEvent extends EventBase {
  type: 'session:saved';
  sessionId: string;
}

export interface SessionLoadedEvent extends EventBase {
  type: 'session:loaded';
  sessionId: string;
  messages: ChatMessage[];
  tokenUsage: TokenUsage;
}

// ── Config Domain ───────────────────────────────────────────────────────────

export interface ConfigChangedEvent extends EventBase {
  type: 'config:changed';
  key: string;
  value: unknown;
}

export interface ProviderSwitchedEvent extends EventBase {
  type: 'config:provider-switched';
  provider: string;
  model: string;
}

export interface ProviderRegisteredEvent extends EventBase {
  type: 'config:provider-registered';
  providerName: string;
  defaultModel: string;
}

// ── Command Domain ──────────────────────────────────────────────────────────

export interface CommandRegisteredEvent extends EventBase {
  type: 'command:registered';
  command: string;
  description: string;
}

export interface CommandExecutedEvent extends EventBase {
  type: 'command:executed';
  command: string;
  arg: string;
}

export interface CommandResultEvent extends EventBase {
  type: 'command:result';
  command: string;
  output: string;
  isError: boolean;
}

// ── UI Domain ───────────────────────────────────────────────────────────────

export interface UiInputSubmittedEvent extends EventBase {
  type: 'ui:input-submitted';
  input: string;
}

export interface UiReadyEvent extends EventBase {
  type: 'ui:ready';
}

// ── Union ───────────────────────────────────────────────────────────────────

export type GolemEvent =
  // Stream
  | StreamRequestedEvent
  | StreamStartedEvent
  | StreamTextDeltaEvent
  | StreamFinishedEvent
  | StreamErrorEvent
  // Tool
  | ToolRegisteredEvent
  | ToolUnregisteredEvent
  | ToolCallRequestedEvent
  | ToolCallStartedEvent
  | ToolCallCompletedEvent
  // Approval
  | ApprovalRequestedEvent
  | ApprovalResolvedEvent
  // Agent
  | AgentStartedEvent
  | AgentTurnCompletedEvent
  | AgentFinishedEvent
  | AgentChainPushEvent
  | AgentChainPopEvent
  | AgentTodosUpdatedEvent
  // MCP
  | McpConnectingEvent
  | McpConnectedEvent
  | McpErrorEvent
  | McpDisconnectedEvent
  // History
  | HistoryMessageAddedEvent
  | HistoryTruncatedEvent
  | HistoryClearedEvent
  // Session
  | SessionSavedEvent
  | SessionLoadedEvent
  // Config
  | ConfigChangedEvent
  | ProviderSwitchedEvent
  | ProviderRegisteredEvent
  // Command
  | CommandRegisteredEvent
  | CommandExecutedEvent
  | CommandResultEvent
  // UI
  | UiInputSubmittedEvent
  | UiReadyEvent;

// ── Helper Types ────────────────────────────────────────────────────────────

/** Extract a specific event type from the union. */
export type EventOfType<T extends GolemEvent['type']> = Extract<GolemEvent, { type: T }>;

/** All valid event type strings. */
export type GolemEventType = GolemEvent['type'];
