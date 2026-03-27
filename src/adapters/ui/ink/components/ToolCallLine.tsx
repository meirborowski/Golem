import React from "react";
import { Box, Text } from "ink";
import { theme, icons } from "../theme.js";
import type { ToolCallEntry } from "../hooks/useUIBridge.js";

interface ToolCallLineProps {
  entry: ToolCallEntry;
}

export function ToolCallLine({ entry }: ToolCallLineProps) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text>    </Text>
        <Text color={theme.toolLabel}>{icons.tool} </Text>
        <Text color={theme.toolLabel} bold>{entry.toolName}</Text>
        <Text>  </Text>
        <Text color={theme.toolArg}>{entry.keyArg}</Text>
        <Text>  </Text>
        {entry.status === "success" && <Text color={theme.success}>{icons.success}</Text>}
        {entry.status === "error" && <Text color={theme.error}>{icons.error}</Text>}
      </Box>
      {entry.status === "error" && entry.resultSummary && (
        <Box>
          <Text>        </Text>
          <Text color={theme.error} dimColor>{entry.resultSummary}</Text>
        </Box>
      )}
    </Box>
  );
}
