import { useCallback, useRef } from 'react';
import { useAppContext } from '../context/app-context.js';
import { useConversation } from './use-conversation.js';
import { runAgent } from '../../agents/agent-runner.js';
import { createDelegateAgent } from '../../tools/delegate-agent.js';
import { getToolMeta } from '../../core/tool-registry.js';
import type { ChainContext } from '../../agents/agent-types.js';

export function useAgent() {
  const { sendMessage, loadSession, engine, approvalCallback, ...rest } = useConversation();
  const { dispatch, agent, config, registry, activeModel } = useAppContext();
  const cancelledRef = useRef(false);

  const sendAgentMessage = useCallback(
    async (input: string) => {
      cancelledRef.current = false;

      // Show the user message once in the UI
      dispatch({ type: 'ADD_USER_MESSAGE', content: input });
      dispatch({ type: 'START_AGENT_MODE', task: input, maxTurns: agent.maxTurns });

      // Wire up delegateAgent tool if the agent supports it
      if (agent.tools.includes('delegateAgent') && engine) {
        const chainContext: ChainContext = {
          depth: 0,
          maxDepth: 3,
          activeAgents: new Set([agent.name]),
          onSubAgentStart: (agentName, depth) =>
            dispatch({ type: 'AGENT_CHAIN_PUSH', agentName }),
          onSubAgentComplete: (_agentName, _depth) =>
            dispatch({ type: 'AGENT_CHAIN_POP' }),
        };

        const delegateTool = createDelegateAgent({
          cwd: config.cwd,
          config,
          registry,
          model: activeModel,
          approvalCallback,
          chainContext,
          isCancelled: () => cancelledRef.current,
        });

        engine.mergeTools({ delegateAgent: delegateTool });
        // Update tool metadata so system prompt includes delegateAgent
        agent.toolMeta = { ...agent.toolMeta, ...getToolMeta({ delegateAgent: delegateTool }) };
      }

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
    [sendMessage, dispatch, agent, config, registry, activeModel, approvalCallback, engine],
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
