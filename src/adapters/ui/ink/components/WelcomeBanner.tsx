import React from "react";
import { Box, Text } from "ink";
import { theme, box } from "../theme.js";

interface WelcomeBannerProps {
  modelName?: string;
  workingDirectory?: string;
  version?: string;
}

const logo = [
  "  ██████   ██████  ██      ███████ ███    ███ ",
  " ██       ██    ██ ██      ██      ████  ████ ",
  " ██   ███ ██    ██ ██      █████   ██ ████ ██ ",
  " ██    ██ ██    ██ ██      ██      ██  ██  ██ ",
  "  ██████   ██████  ███████ ███████ ██      ██ ",
];

export function WelcomeBanner({ modelName, workingDirectory, version }: WelcomeBannerProps) {
  const separator = box.horizontal.repeat(50);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text> </Text>
      {logo.map((line, i) => (
        <Text key={i} color={theme.brand}>{line}</Text>
      ))}
      <Text> </Text>
      <Box gap={2}>
        {version && <Text dimColor>v{version}</Text>}
        {modelName && (
          <Text dimColor>
            model: <Text color={theme.accent}>{modelName}</Text>
          </Text>
        )}
      </Box>
      {workingDirectory && (
        <Text dimColor>
          cwd: <Text color={theme.muted}>{workingDirectory}</Text>
        </Text>
      )}
      <Text dimColor>{separator}</Text>
    </Box>
  );
}
