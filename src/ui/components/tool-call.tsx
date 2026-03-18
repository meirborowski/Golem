import React from 'react';
import { Box, Text } from 'ink';
import type { ToolCallInfo } from '../../core/types.js';

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const { toolName, args, result, status } = toolCall;

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
      {result !== undefined && status === 'completed' && (
        <Box marginLeft={2}>
          <Text dimColor wrap="wrap">
            {String(formatResult(result))}
          </Text>
        </Box>
      )}
      {result !== undefined && status === 'error' && (
        <Box marginLeft={2}>
          <Text color="red" wrap="wrap">
            {String(formatResult(result))}
          </Text>
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

function formatResult(result: unknown): string {
  if (typeof result === 'string') return result.slice(0, 200);
  if (typeof result !== 'object' || result === null) return String(result);

  const obj = result as Record<string, unknown>;

  if (obj['success'] === false && obj['error']) {
    return `Error: ${String(obj['error'])}`;
  }

  if (obj['success'] === true) {
    if (obj['content']) return String(obj['content']).slice(0, 200) + '...';
    if (obj['files']) {
      const files = obj['files'] as string[];
      return `${files.length} files found`;
    }
    if (obj['matches']) {
      const matches = obj['matches'] as unknown[];
      return `${matches.length} matches found`;
    }
    if (obj['stdout']) return String(obj['stdout']).slice(0, 200);
    return 'Done';
  }

  return JSON.stringify(result).slice(0, 200);
}
