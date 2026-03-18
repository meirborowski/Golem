import React from 'react';
import { Box, Text } from 'ink';
import type { TokenUsage } from '../../core/types.js';

interface StatusBarProps {
  provider: string;
  model: string;
  tokenUsage: TokenUsage;
}

export function StatusBar({ provider, model, tokenUsage }: StatusBarProps) {
  const tokens = tokenUsage.totalTokens > 0 ? `${tokenUsage.totalTokens} tokens` : '';

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box>
        <Text dimColor>
          {provider}/{model}
        </Text>
      </Box>
      {tokens && (
        <Box>
          <Text dimColor>{tokens}</Text>
        </Box>
      )}
    </Box>
  );
}
