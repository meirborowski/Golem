/**
 * useBusSendMessage — Send messages and control agent execution via the bus.
 */

import { useCallback } from 'react';
import { useBus, useSubscribers } from '../context/bus-provider.js';
import { createEvent } from '../../bus/helpers.js';
import type { AgentConfig } from '../../agents/agent-types.js';

export function useBusSendMessage(agent: AgentConfig) {
  const bus = useBus();
  const { agentLoop } = useSubscribers();

  /** Send a regular chat message via the bus. */
  const sendMessage = useCallback(
    (input: string) => {
      void bus.emit(createEvent('ui:input-submitted', { input }));
    },
    [bus],
  );

  /** Start an agent task. */
  const sendAgentMessage = useCallback(
    (input: string) => {
      void agentLoop.run(input, agent);
    },
    [agentLoop, agent],
  );

  /** Cancel the running agent. */
  const cancelAgent = useCallback(() => {
    agentLoop.cancel();
  }, [agentLoop]);

  return { sendMessage, sendAgentMessage, cancelAgent };
}
