import React from 'react';
import { Box, Text } from 'ink';
import type { TokenUsage } from '../../core/types.js';

interface StatusBarProps {
  provider: string;
  model: string;
  tokenUsage: TokenUsage;
  contextWindow?: number;
}

export function StatusBar({ provider, model, tokenUsage, contextWindow }: StatusBarProps) {
  const parts: string[] = [];
  if (tokenUsage.totalTokens > 0) {
    parts.push(`${tokenUsage.promptTokens}p / ${tokenUsage.completionTokens}c`);
    if (contextWindow && contextWindow > 0) {
      const pct = Math.round((tokenUsage.promptTokens / contextWindow) * 100);
      parts.push(`${pct}% ctx`);
    }
  }
  const tokenDisplay = parts.join(' | ');

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box>
        <Text dimColor>
          {provider}/{model}
        </Text>
      </Box>
      {tokenDisplay && (
        <Box>
          <Text dimColor>{tokenDisplay}</Text>
        </Box>
      )}
    </Box>
  );
}
