import React from 'react';
import { Box, Text } from 'ink';

interface WelcomeProps {
  provider: string;
  model: string;
  cwd: string;
  debug?: boolean;
  mcpServerCount?: number;
}

export function Welcome({ provider, model, cwd, debug, mcpServerCount }: WelcomeProps) {
  const displayCwd = cwd.length > 60 ? '...' + cwd.slice(-57) : cwd;

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
      <Text dimColor> AI Coding Assistant</Text>
      <Box marginTop={1}>
        <Text dimColor>Provider: </Text>
        <Text color="green">{provider}</Text>
        <Text dimColor> | Model: </Text>
        <Text color="green">{model}</Text>
        {debug && <Text color="yellow"> | DEBUG</Text>}
      </Box>
      <Box>
        <Text dimColor>Working in: </Text>
        <Text>{displayCwd}</Text>
      </Box>
      {mcpServerCount != null && mcpServerCount > 0 && (
        <Box>
          <Text dimColor>MCP servers: </Text>
          <Text color="green">{mcpServerCount} connected</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>Type /exit to quit, /help for commands.</Text>
      </Box>
    </Box>
  );
}
