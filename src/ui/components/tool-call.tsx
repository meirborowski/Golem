import React from 'react';
import { Box, Text } from 'ink';
import type { ToolCallInfo } from '../../core/types.js';
import { formatArgs } from '../../utils/format-args.js';

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const { toolName, args, status } = toolCall;

  const statusIcon =
    status === 'completed' ? (
      <Text color="green">+</Text>
    ) : status === 'running' ? (
      <Text color="yellow">~</Text>
    ) : status === 'error' ? (
      <Text color="red">x</Text>
    ) : (
      <Text dimColor>.</Text>
    );

  const argsPreview = formatArgs(args);

  return (
    <Box flexDirection="column">
      <Box>
        {statusIcon}
        <Text color="magenta"> {toolName}</Text>
        <Text dimColor>({argsPreview})</Text>
      </Box>
      {status === 'completed' && (
        <Box marginLeft={4}>
          <Text dimColor>Done</Text>
        </Box>
      )}
      {status === 'error' && (
        <Box marginLeft={4}>
          <Text color="red">Failed</Text>
        </Box>
      )}
    </Box>
  );
}
