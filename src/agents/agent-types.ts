import type { SendMessageOptions, TurnResult, ToolCallInfo } from '../core/types.js';
import type { ToolMeta } from '../core/tool-registry.js';

// ── Agent Config ───────────────────────────────────────────────────────────

export interface AgentConfig {
  /** Unique identifier, e.g. 'default', 'code-review'. */
  name: string;

  /** Human-readable description for UI/help. */
  description: string;

  /**
   * Prompt sections loaded from the markdown body.
   * Keys are lowercase section headings (e.g. 'identity', 'guidelines', 'behavior').
   * Values are the raw section content (trimmed).
   */
  sections: Record<string, string>;

  /** Which built-in tools this agent can use. Must be explicitly listed. */
  tools: string[];

  /** Tool metadata (description + whenToUse) for each tool. Populated at load time. */
  toolMeta: Record<string, ToolMeta>;

  /** Max auto-continuation turns. */
  maxTurns: number;

  /** Max consecutive errors before stopping. */
  maxConsecutiveErrors: number;

  /** Prompt sent to the model between turns to continue work. */
  continuationPrompt: string;

  /**
   * Strategy for deciding when to stop the agent loop.
   * - 'default': stop on agentDone, no tool calls, tool calls + text, or consecutive errors
   * - 'agent-done-only': only stop on agentDone, cancellation, max turns, or max errors
   * - 'single-turn': run one turn with no auto-continuation
   */
  stopCondition: 'default' | 'agent-done-only' | 'single-turn';
}

// ── Agent Runner ───────────────────────────────────────────────────────────

export interface AgentCallbacks {
  sendMessage: (input: string, opts: SendMessageOptions) => Promise<TurnResult>;
  onTurnComplete: (turn: number) => void;
  isCancelled: () => boolean;
}

export interface AgentRunResult {
  status: 'completed' | 'cancelled' | 'error';
  finalText: string;
  allToolCalls: ToolCallInfo[];
  lastError: string;
  turnsUsed: number;
}
