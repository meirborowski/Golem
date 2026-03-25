/**
 * AgentLoop subscriber — Multi-turn agent state machine.
 *
 * Listens: agent:started, stream:finished
 * Emits:   stream:requested, agent:turn-completed, agent:finished, agent:chain-push, agent:chain-pop
 */

import type { EventBus, Unsubscribe } from '../bus/event-bus.js';
import { createEvent } from '../bus/helpers.js';
import type { AgentConfig } from '../agents/agent-types.js';
import type { ToolCallInfo, AgentTodoItem } from '../core/types.js';
import { logger } from '../utils/logger.js';

interface AgentRunState {
  task: string;
  agent: AgentConfig;
  turn: number;
  consecutiveErrors: number;
  allToolCalls: ToolCallInfo[];
  lastText: string;
  lastError: string;
  cancelled: boolean;
  running: boolean;
}

/**
 * Determine whether the agent loop should continue after a turn.
 */
function shouldContinue(
  agent: AgentConfig,
  turnResult: { hadToolCalls: boolean; hadTextOutput: boolean; agentDoneCalled: boolean; errorCount: number },
  consecutiveErrors: number,
): boolean {
  if (turnResult.agentDoneCalled) return false;
  if (consecutiveErrors >= agent.maxConsecutiveErrors) return false;

  switch (agent.stopCondition) {
    case 'single-turn':
      return false;

    case 'agent-done-only':
      if (turnResult.errorCount > 0 && !turnResult.hadToolCalls && !turnResult.hadTextOutput) {
        return false;
      }
      return true;

    case 'default':
    default:
      if (turnResult.errorCount > 0 && !turnResult.hadToolCalls && !turnResult.hadTextOutput) {
        return false;
      }
      if (!turnResult.hadToolCalls) return false;
      if (turnResult.hadTextOutput) return false;
      return true;
  }
}

export class AgentLoop {
  private state: AgentRunState | null = null;
  private disposers: Unsubscribe[] = [];
  private streamFinishHandler: Unsubscribe | null = null;

  constructor(private bus: EventBus) {
    this.disposers.push(
      bus.on('agent:started', (e) => { void this.handleAgentStarted(e); }),
    );
  }

  /** Cancel the current agent run. */
  cancel(): void {
    if (this.state) {
      this.state.cancelled = true;
    }
  }

  /** Check if an agent is currently running. */
  isRunning(): boolean {
    return this.state?.running ?? false;
  }

  /** Get the current agent state (for session serialization). */
  getState(): AgentRunState | null {
    return this.state ? { ...this.state } : null;
  }

  private async handleAgentStarted(
    event: import('../bus/events.js').AgentStartedEvent,
  ): Promise<void> {
    // This is a placeholder — the actual agent config needs to be passed in.
    // For now, we use a minimal config. The bootstrap will set up the real one.
    logger.info('Agent started', { task: event.task, agent: event.agentName });
  }

  /**
   * Run the agent loop. Called externally (e.g., from the UI hook or command handler).
   * This is the main entry point for agent execution.
   */
  async run(task: string, agent: AgentConfig): Promise<void> {
    this.state = {
      task,
      agent,
      turn: 0,
      consecutiveErrors: 0,
      allToolCalls: [],
      lastText: '',
      lastError: '',
      cancelled: false,
      running: true,
    };

    await this.bus.emit(createEvent('agent:started', {
      task,
      agentName: agent.name,
      maxTurns: agent.maxTurns,
    }));

    try {
      await this.executeTurns();
    } finally {
      this.state.running = false;
    }
  }

  private async executeTurns(): Promise<void> {
    const state = this.state!;
    const { agent, task } = state;

    // Turn 1
    state.turn = 1;
    await this.bus.emit(createEvent('agent:turn-completed', {
      turn: state.turn,
      hadToolCalls: false,
      hadTextOutput: false,
      agentDoneCalled: false,
      errorCount: 0,
    }));

    let turnResult = await this.sendAndWait(task);

    if (turnResult.fullText) state.lastText = turnResult.fullText;
    if (turnResult.lastError) state.lastError = turnResult.lastError;
    state.allToolCalls.push(...turnResult.toolCalls);

    // Auto-continuation loop
    while (state.turn < agent.maxTurns && !state.cancelled) {
      const hadToolCalls = turnResult.toolCalls.length > 0;
      const hadTextOutput = turnResult.fullText.length > 0;
      const agentDoneCalled = turnResult.toolCalls.some((tc) => tc.toolName === 'agentDone');
      const errorCount = turnResult.toolCalls.filter((tc) => tc.status === 'error').length
        + (turnResult.lastError ? 1 : 0);

      if (!shouldContinue(agent, { hadToolCalls, hadTextOutput, agentDoneCalled, errorCount }, state.consecutiveErrors)) {
        break;
      }

      // Track consecutive errors
      if (errorCount > 0) {
        state.consecutiveErrors += errorCount;
      } else {
        state.consecutiveErrors = 0;
      }

      if (state.consecutiveErrors >= agent.maxConsecutiveErrors) break;

      // Start next turn
      state.turn++;
      await this.bus.emit(createEvent('agent:turn-completed', {
        turn: state.turn,
        hadToolCalls,
        hadTextOutput,
        agentDoneCalled,
        errorCount,
      }));

      turnResult = await this.sendAndWait(agent.continuationPrompt);

      if (turnResult.fullText) state.lastText = turnResult.fullText;
      if (turnResult.lastError) state.lastError = turnResult.lastError;
      state.allToolCalls.push(...turnResult.toolCalls);
    }

    // Determine final status
    let status: 'completed' | 'cancelled' | 'error' = 'completed';
    if (state.cancelled) {
      status = 'cancelled';
    } else if (state.consecutiveErrors >= agent.maxConsecutiveErrors) {
      status = 'error';
    }

    // Extract final text
    let finalText = state.lastText;
    if (!finalText) {
      const agentDoneCall = state.allToolCalls.find(
        (tc) => tc.toolName === 'agentDone' && tc.result != null,
      );
      if (agentDoneCall && typeof agentDoneCall.result === 'object') {
        const result = agentDoneCall.result as Record<string, unknown>;
        if (typeof result['summary'] === 'string') {
          finalText = result['summary'];
        } else if (typeof result['_summary'] === 'string') {
          finalText = result['_summary'];
        }
      }
    }

    await this.bus.emit(createEvent('agent:finished', {
      status,
      finalText: finalText || (status === 'cancelled' ? 'Agent cancelled.' : status === 'error' ? 'Agent stopped due to errors.' : 'Task completed.'),
      turnsUsed: state.turn,
      toolCallCount: state.allToolCalls.length,
    }));
  }

  private async sendAndWait(
    message: string,
  ): Promise<{ fullText: string; toolCalls: ToolCallInfo[]; lastError: string }> {
    // Emit stream:requested and wait for stream:finished or stream:error
    const requestEvent = createEvent('stream:requested', {
      userMessage: message,
      options: { silent: true, background: true },
    });

    const requestId = requestEvent.id;

    // Start listening before emitting to avoid race
    const finishedPromise = this.bus.waitFor(
      'stream:finished',
      (e) => e.requestId === requestId,
      600_000, // 10 minute timeout
    ).catch(() => null);

    const errorPromise = this.bus.waitFor(
      'stream:error',
      (e) => e.requestId === requestId,
      600_000,
    ).catch(() => null);

    await this.bus.emit(requestEvent);

    // Wait for either finish or error
    const result = await Promise.race([finishedPromise, errorPromise]);

    if (!result) {
      return { fullText: '', toolCalls: [], lastError: 'Stream timed out' };
    }

    if (result.type === 'stream:error') {
      return { fullText: '', toolCalls: [], lastError: result.error };
    }

    return {
      fullText: result.fullText,
      toolCalls: result.toolCalls,
      lastError: '',
    };
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    if (this.streamFinishHandler) {
      this.streamFinishHandler();
    }
  }
}
