import type { AgentConfig, AgentCallbacks, AgentRunResult } from './agent-types.js';
import type { ToolCallInfo } from '../core/types.js';

/**
 * Determine whether the agent loop should stop after a turn.
 * Returns true if the loop should continue.
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
      // Only stop on agentDone, cancellation, max turns, or max errors (handled above/outside)
      // Fatal error: errors with no useful output
      if (turnResult.errorCount > 0 && !turnResult.hadToolCalls && !turnResult.hadTextOutput) {
        return false;
      }
      return true;

    case 'default':
    default:
      // Fatal error: errors with no useful output
      if (turnResult.errorCount > 0 && !turnResult.hadToolCalls && !turnResult.hadTextOutput) {
        return false;
      }
      // No tool calls — pure text Q&A
      if (!turnResult.hadToolCalls) return false;
      // Tool calls + text output — gathered info and answered
      if (turnResult.hadTextOutput) return false;
      // Tool calls with no text — keep going
      return true;
  }
}

/**
 * Run the agent loop. Framework-agnostic — no React dependencies.
 * The caller provides callbacks for sending messages, reporting progress, and checking cancellation.
 */
export async function runAgent(
  input: string,
  agent: AgentConfig,
  callbacks: AgentCallbacks,
): Promise<AgentRunResult> {
  const allToolCalls: ToolCallInfo[] = [];
  let lastText = '';
  let lastError = '';
  let consecutiveErrors = 0;

  // Turn 1
  let turn = 1;
  callbacks.onTurnComplete(turn);
  let turnResult = await callbacks.sendMessage(input, { silent: true, background: true });

  if (turnResult.finalText) lastText = turnResult.finalText;
  if (turnResult.lastError) lastError = turnResult.lastError;
  allToolCalls.push(...turnResult.toolCalls);

  // Auto-continuation loop
  while (turn < agent.maxTurns && !callbacks.isCancelled()) {
    if (!shouldContinue(agent, turnResult, consecutiveErrors)) break;

    // Track consecutive errors
    if (turnResult.errorCount > 0) {
      consecutiveErrors += turnResult.errorCount;
    } else {
      consecutiveErrors = 0;
    }

    if (consecutiveErrors >= agent.maxConsecutiveErrors) break;

    // Start next turn
    turn++;
    callbacks.onTurnComplete(turn);

    turnResult = await callbacks.sendMessage(agent.continuationPrompt, {
      silent: true,
      background: true,
    });

    if (turnResult.finalText) lastText = turnResult.finalText;
    if (turnResult.lastError) lastError = turnResult.lastError;
    allToolCalls.push(...turnResult.toolCalls);
  }

  // Determine final status
  if (callbacks.isCancelled()) {
    return {
      status: 'cancelled',
      finalText: lastText || 'Agent cancelled.',
      allToolCalls,
      lastError,
      turnsUsed: turn,
    };
  }

  if (
    consecutiveErrors >= agent.maxConsecutiveErrors ||
    (turnResult.errorCount > 0 && !turnResult.hadToolCalls && !turnResult.hadTextOutput)
  ) {
    return {
      status: 'error',
      finalText: lastError || 'Agent stopped due to repeated errors.',
      allToolCalls,
      lastError,
      turnsUsed: turn,
    };
  }

  // Extract summary from agentDone if no text was produced
  let finalText = lastText;
  if (!finalText) {
    const agentDoneCall = allToolCalls.find((tc) => tc.toolName === 'agentDone' && tc.result != null);
    if (agentDoneCall && typeof agentDoneCall.result === 'object') {
      const result = agentDoneCall.result as Record<string, unknown>;
      if (typeof result['summary'] === 'string') {
        finalText = result['summary'];
      } else if (typeof result['_summary'] === 'string') {
        finalText = result['_summary'];
      }
    }
  }

  return {
    status: 'completed',
    finalText: finalText || 'Task completed.',
    allToolCalls,
    lastError,
    turnsUsed: turn,
  };
}
