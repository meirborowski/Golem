import React from 'react';
import { Box, Text } from 'ink';
import type { ToolCallInfo } from '../../core/types.js';
import { getResultPreview } from '../../core/format-tool-result.js';
import { formatArgs } from '../../utils/format-args.js';
import { formatDuration } from '../../utils/format-duration.js';

const MAX_ARGS_LEN = 80;

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const { toolName, args, status, result, durationMs } = toolCall;

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

  const rawPreview = formatArgs(args);
  const argsPreview =
    rawPreview.length > MAX_ARGS_LEN
      ? rawPreview.slice(0, MAX_ARGS_LEN - 3) + '...'
      : rawPreview;

  const resultPreview = getResultPreview(result, status);

  return (
    <Box flexDirection="column">
      <Box>
        {statusIcon}
        <Text color="magenta"> {toolName}</Text>
        <Text dimColor>({argsPreview})</Text>
        {durationMs != null && (
          <Text dimColor> {formatDuration(durationMs)}</Text>
        )}
      </Box>
      {resultPreview && (
        <Box marginLeft={4}>
          <Text color={status === 'error' ? 'red' : undefined} dimColor={status !== 'error'}>
            {resultPreview}
          </Text>
        </Box>
      )}
    </Box>
  );
}
