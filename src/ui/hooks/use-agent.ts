import { useCallback, useRef } from 'react';
import { useAppContext } from '../context/app-context.js';
import { useConversation } from './use-conversation.js';
import { runAgent } from '../../agents/agent-runner.js';

export function useAgent() {
  const { sendMessage, loadSession, ...rest } = useConversation();
  const { dispatch, agent } = useAppContext();
  const cancelledRef = useRef(false);

  const sendAgentMessage = useCallback(
    async (input: string) => {
      cancelledRef.current = false;

      // Show the user message once in the UI
      dispatch({ type: 'ADD_USER_MESSAGE', content: input });
      dispatch({ type: 'START_AGENT_MODE', task: input, maxTurns: agent.maxTurns });

      const result = await runAgent(input, agent, {
        sendMessage,
        onTurnComplete: (turn) => dispatch({ type: 'AGENT_TURN_COMPLETE', turn }),
        isCancelled: () => cancelledRef.current,
      });

      // Clear any stale approval state from interrupted turns
      dispatch({ type: 'SET_PENDING_APPROVAL', approval: null });

      // Emit the single final assistant message
      dispatch({
        type: 'SET_AGENT_FINAL_MESSAGE',
        content: result.finalText,
        toolCalls: result.allToolCalls,
      });

      if (result.status === 'error') {
        dispatch({ type: 'SET_ERROR', error: result.lastError || result.finalText });
      }

      dispatch({ type: 'STOP_AGENT_MODE', status: result.status });
    },
    [sendMessage, dispatch, agent],
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
