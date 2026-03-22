import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { AgentModeState } from '../../core/types.js';

const MAX_VISIBLE_TOOLS = 8;

export function AgentProgress({ agentMode }: { agentMode: AgentModeState }) {
  const taskPreview =
    agentMode.task.length > 50 ? agentMode.task.slice(0, 50) + '…' : agentMode.task;

  // Show last N tool activities
  const recentTools = agentMode.toolActivity.slice(-MAX_VISIBLE_TOOLS);
  const hiddenCount = agentMode.toolActivity.length - recentTools.length;

  return (
    <Box flexDirection="column" marginLeft={2} marginBottom={1}>
      <Box>
        <Text color="magenta" bold>
          ● Agent
        </Text>
        <Text color="magenta">
          {' '}— turn {agentMode.currentTurn}/{agentMode.maxTurns}
        </Text>
        {agentMode.totalToolsExecuted > 0 && (
          <Text dimColor>
            {' '}| {agentMode.totalToolsExecuted} tool{agentMode.totalToolsExecuted !== 1 ? 's' : ''} run
          </Text>
        )}
        <Text dimColor> | {taskPreview}</Text>
        <Text dimColor> | Escape to stop</Text>
      </Box>

      {hiddenCount > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>… {hiddenCount} earlier tool{hiddenCount > 1 ? 's' : ''}</Text>
        </Box>
      )}

      {recentTools.map((tool, i) => (
        <Box key={i} marginLeft={2}>
          {tool.status === 'completed' ? (
            <Text color="green">+</Text>
          ) : tool.status === 'error' ? (
            <Text color="red">x</Text>
          ) : (
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
          )}
          <Text color="cyan"> {tool.toolName}</Text>
          <Text dimColor>({tool.argsPreview})</Text>
          {tool.status === 'completed' && <Text dimColor> Done</Text>}
          {tool.status === 'error' && <Text color="red"> Failed</Text>}
        </Box>
      ))}
    </Box>
  );
}
