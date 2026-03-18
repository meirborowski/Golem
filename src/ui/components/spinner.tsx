import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';

interface SpinnerProps {
  label?: string;
}

export function Spinner({ label = 'Thinking...' }: SpinnerProps) {
  return (
    <Box marginLeft={2}>
      <Text color="cyan">
        <InkSpinner type="dots" />
      </Text>
      <Text dimColor> {label}</Text>
    </Box>
  );
}
