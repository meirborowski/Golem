import React from 'react';
import { Box, Text } from 'ink';
import type { ToolCallInfo } from '../../core/types.js';

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

function formatArgs(args: unknown): string {
  if (typeof args !== 'object' || args === null) return String(args);
  const obj = args as Record<string, unknown>;

  // Show key arguments concisely
  const parts: string[] = [];
  if ('filePath' in obj) parts.push(String(obj['filePath']));
  if ('pattern' in obj) parts.push(`"${String(obj['pattern'])}"`);
  if ('command' in obj) parts.push(`$ ${String(obj['command'])}`);
  if ('glob' in obj) parts.push(String(obj['glob']));

  return parts.length > 0 ? parts.join(', ') : JSON.stringify(args).slice(0, 80);
}
