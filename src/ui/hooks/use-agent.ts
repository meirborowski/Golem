import { useCallback, useRef } from 'react';
import { useAppContext } from '../context/app-context.js';
import { useConversation } from './use-conversation.js';

const MAX_TURNS = 20;
const MAX_CONSECUTIVE_ERRORS = 3;

export function useAgent() {
  const { sendMessage, loadSession, ...rest } = useConversation();
  const { dispatch } = useAppContext();
  const cancelledRef = useRef(false);

  const sendAgentMessage = useCallback(
    async (input: string) => {
      cancelledRef.current = false;
      dispatch({ type: 'START_AGENT_MODE', task: input, maxTurns: MAX_TURNS });

      // First turn: send the user's actual message
      let turnResult = await sendMessage(input);
      let turn = 1;
      let consecutiveErrors = 0;

      // Auto-continuation loop
      while (turn < MAX_TURNS && !cancelledRef.current) {
        dispatch({ type: 'AGENT_TURN_COMPLETE' });

        // Stop if agentDone was called
        if (turnResult.agentDoneCalled) {
          dispatch({ type: 'STOP_AGENT_MODE', status: 'completed' });
          return;
        }

        // Stop if no tool calls — pure text Q&A
        if (!turnResult.hadToolCalls) {
          dispatch({ type: 'STOP_AGENT_MODE', status: 'completed' });
          return;
        }

        // Stop if the AI used tools AND produced a text response.
        // This means the AI gathered info (tools) and answered (text) — task is done.
        // Only continue if the turn was pure tool calls with no text summary.
        if (turnResult.hadTextOutput) {
          dispatch({ type: 'STOP_AGENT_MODE', status: 'completed' });
          return;
        }

        // Track consecutive errors
        if (turnResult.errorCount > 0) {
          consecutiveErrors += turnResult.errorCount;
        } else {
          consecutiveErrors = 0;
        }

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          dispatch({ type: 'STOP_AGENT_MODE', status: 'error' });
          return;
        }

        // Show a subtle continuation message
        dispatch({
          type: 'ADD_SYSTEM_MESSAGE',
          content: `[Continuing — turn ${turn + 1}/${MAX_TURNS}]`,
        });

        // Continue the agent — silent (no user message shown), suppress text
        turnResult = await sendMessage(
          'Continue working on the task. If you are done, call the agentDone tool.',
          { silent: true, suppressText: true },
        );
        turn++;
      }

      // Exited the loop — either max turns or cancelled
      if (cancelledRef.current) {
        dispatch({ type: 'STOP_AGENT_MODE', status: 'cancelled' });
      } else {
        dispatch({
          type: 'ADD_SYSTEM_MESSAGE',
          content: `[Agent reached maximum of ${MAX_TURNS} turns]`,
        });
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
