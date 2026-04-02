import React from "react";
import { Box, Text } from "ink";
import { theme, box } from "../theme.js";
import type { AppState } from "../hooks/useUIBridge.js";
import type { SessionTokenUsage } from "#core/entities/AgentContext.js";
import { formatTokenCount, formatCost } from "#core/pricing.js";

interface StatusBarProps {
  appState: AppState;
  modelName?: string;
  workingDirectory?: string;
  sessionTokenUsage?: SessionTokenUsage | null;
}

const hintsMap: Record<AppState, string> = {
  idle: "enter: send  |  type 'exit' to quit",
  thinking: "waiting for model...",
  streaming: "streaming response...",
  confirming: "y: approve all \u2502 n: reject \u2502 s: select \u2502 j/k: browse",
};

function formatUsage(session: SessionTokenUsage): string {
  const inp = formatTokenCount(session.totalInputTokens);
  const out = formatTokenCount(session.totalOutputTokens);
  if (session.estimatedCost > 0) {
    return `↑${inp} ↓${out} | ${formatCost(session.estimatedCost)}`;
  }
  return `↑${inp} ↓${out}`;
}

export const StatusBar = React.memo(function StatusBar({ appState, modelName, workingDirectory, sessionTokenUsage }: StatusBarProps) {
  const width = Math.min(process.stdout.columns || 80, 100);
  const separator = box.horizontal.repeat(width);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>{separator}</Text>
      <Box justifyContent="space-between">
        <Box gap={2}>
          {modelName && <Text dimColor>{modelName}</Text>}
          {workingDirectory && <Text dimColor>{truncatePath(workingDirectory, 30)}</Text>}
          {sessionTokenUsage && sessionTokenUsage.totalTokens > 0 && (
            <Text dimColor>{formatUsage(sessionTokenUsage)}</Text>
          )}
        </Box>
        <Text color={theme.muted}>{hintsMap[appState]}</Text>
      </Box>
    </Box>
  );
});

function truncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;
  return "..." + path.slice(path.length - maxLen + 3);
}
