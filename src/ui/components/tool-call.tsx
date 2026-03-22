import React from 'react';
import { Box, Text } from 'ink';
import type { ToolCallInfo } from '../../core/types.js';
import { formatArgs } from '../../utils/format-args.js';
import { formatDuration } from '../../utils/format-duration.js';

const MAX_ARGS_LEN = 80;
const MAX_PREVIEW_LEN = 120;

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

function getResultPreview(result: unknown, status: string): string | null {
  if (result == null) {
    if (status === 'completed') return 'Done';
    if (status === 'error') return 'Failed';
    return null;
  }

  // Handle string results directly
  if (typeof result === 'string') {
    return truncate(result, MAX_PREVIEW_LEN);
  }

  if (typeof result !== 'object' || result === null) {
    return truncate(String(result), MAX_PREVIEW_LEN);
  }

  const obj = result as Record<string, unknown>;

  // Handle error results — extract the error message
  if (status === 'error' || obj['success'] === false) {
    if (typeof obj['error'] === 'string') {
      return truncate(obj['error'], MAX_PREVIEW_LEN);
    }
    return 'Failed';
  }

  // Handle truncated results from summarizeToolResult ({ _summary: "..." })
  if (typeof obj['_summary'] === 'string') {
    return 'Done';
  }

  // Handle success results — extract meaningful fields
  if (obj['success'] === true) {
    // Show stdout if present (git, bash results)
    if (typeof obj['stdout'] === 'string' && obj['stdout']) {
      return truncate(obj['stdout'], MAX_PREVIEW_LEN);
    }
    // Show filePath if present (readFile, writeFile results)
    if (typeof obj['filePath'] === 'string') {
      return truncate(obj['filePath'], MAX_PREVIEW_LEN);
    }
    // Show result field if present
    if (typeof obj['result'] === 'string') {
      return truncate(obj['result'], MAX_PREVIEW_LEN);
    }
    return 'Done';
  }

  return 'Done';
}

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
