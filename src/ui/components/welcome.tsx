import React from 'react';
import { Box, Text } from 'ink';

interface WelcomeProps {
  provider: string;
  model: string;
  cwd: string;
}

export function Welcome({ provider, model, cwd }: WelcomeProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        {`  ___       _`}
      </Text>
      <Text bold color="cyan">
        {` / __|___ | |___ _ __`}
      </Text>
      <Text bold color="cyan">
        {`| (_ / _ \\| / -_) '  \\`}
      </Text>
      <Text bold color="cyan">
        {` \\___\\___/|_\\___|_|_|_|`}
      </Text>
      <Text dimColor> AI Coding Assistant v0.1.0</Text>
      <Box marginTop={1}>
        <Text dimColor>Provider: </Text>
        <Text color="green">{provider}</Text>
        <Text dimColor> | Model: </Text>
        <Text color="green">{model}</Text>
      </Box>
      <Box>
        <Text dimColor>Working in: </Text>
        <Text>{cwd}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Type your message and press Enter. Ctrl+C to exit.</Text>
      </Box>
    </Box>
  );
}
