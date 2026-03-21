import React from 'react';
import { Box, Text } from 'ink';
import type { AgentModeState } from '../../core/types.js';

export function AgentProgress({ agentMode }: { agentMode: AgentModeState }) {
  const taskPreview =
    agentMode.task.length > 50 ? agentMode.task.slice(0, 50) + '…' : agentMode.task;

  return (
    <Box marginLeft={2} marginBottom={1}>
      <Text color="magenta" bold>
        ● Agent
      </Text>
      <Text color="magenta">
        {' '}
        — turn {agentMode.currentTurn}/{agentMode.maxTurns}
      </Text>
      <Text dimColor> | {taskPreview}</Text>
      <Text dimColor> | Escape to stop</Text>
    </Box>
  );
}
