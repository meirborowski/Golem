import { useCallback, useRef } from 'react';
import { useAppContext } from '../context/app-context.js';
import { useConversation } from './use-conversation.js';
import type { ToolCallInfo } from '../../core/types.js';

const MAX_TURNS = 20;
const MAX_CONSECUTIVE_ERRORS = 3;

export function useAgent() {
  const { sendMessage, loadSession, ...rest } = useConversation();
  const { dispatch } = useAppContext();
  const cancelledRef = useRef(false);

  const sendAgentMessage = useCallback(
    async (input: string) => {
      cancelledRef.current = false;

      // Show the user message once in the UI
      dispatch({ type: 'ADD_USER_MESSAGE', content: input });
      dispatch({ type: 'START_AGENT_MODE', task: input, maxTurns: MAX_TURNS });

      // Turn 1 — run in background
      let turn = 1;
      dispatch({ type: 'AGENT_TURN_COMPLETE', turn });
      let turnResult = await sendMessage(input, { silent: true, background: true });
      let consecutiveErrors = 0;
      let lastText = turnResult.finalText;
      const allToolCalls: ToolCallInfo[] = [...turnResult.toolCalls];

      // Auto-continuation loop
      let lastError = turnResult.lastError;

      while (turn < MAX_TURNS && !cancelledRef.current) {
        // Stop if agentDone was called
        if (turnResult.agentDoneCalled) {
          break;
        }

        // Fatal error: errors with no useful output — stop immediately
        if (turnResult.errorCount > 0 && !turnResult.hadToolCalls && !turnResult.hadTextOutput) {
          consecutiveErrors += turnResult.errorCount;
          break;
        }

        // Stop if no tool calls — pure text Q&A
        if (!turnResult.hadToolCalls) {
          break;
        }

        // Stop if the AI used tools AND produced a text response —
        // it gathered info (tools) and answered (text), task is done.
        if (turnResult.hadTextOutput) {
          break;
        }

        // Track consecutive errors
        if (turnResult.errorCount > 0) {
          consecutiveErrors += turnResult.errorCount;
        } else {
          consecutiveErrors = 0;
        }

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          break;
        }

        // Start next turn
        turn++;
        dispatch({ type: 'AGENT_TURN_COMPLETE', turn });

        // Continue in background — completely silent
        turnResult = await sendMessage(
          'Continue working on the task. If you are done, call the agentDone tool.',
          { silent: true, background: true },
        );
        if (turnResult.finalText) {
          lastText = turnResult.finalText;
        }
        if (turnResult.lastError) {
          lastError = turnResult.lastError;
        }
        allToolCalls.push(...turnResult.toolCalls);
      }

      // Clear any stale approval state from interrupted turns
      dispatch({ type: 'SET_PENDING_APPROVAL', approval: null });

      // Emit the single final assistant message
      if (cancelledRef.current) {
        const cancelText = lastText || 'Agent cancelled.';
        dispatch({ type: 'SET_AGENT_FINAL_MESSAGE', content: cancelText, toolCalls: allToolCalls });
        dispatch({ type: 'STOP_AGENT_MODE', status: 'cancelled' });
      } else if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS || (turnResult.errorCount > 0 && !turnResult.hadToolCalls && !turnResult.hadTextOutput)) {
        const errorText = lastError || 'Agent stopped due to repeated errors.';
        dispatch({ type: 'SET_AGENT_FINAL_MESSAGE', content: errorText, toolCalls: allToolCalls });
        dispatch({ type: 'SET_ERROR', error: errorText });
        dispatch({ type: 'STOP_AGENT_MODE', status: 'error' });
      } else {
        const finalText = lastText || 'Task completed.';
        dispatch({ type: 'SET_AGENT_FINAL_MESSAGE', content: finalText, toolCalls: allToolCalls });
        dispatch({ type: 'STOP_AGENT_MODE', status: 'completed' });
      }
    },
    [sendMessage, dispatch],
  );

  const cancelAgent = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  return {
    ...rest,
    sendMessage: sendAgentMessage,
    cancelAgent,
    loadSession,
  };
}
