import React from "react";
import { Box, Text } from "ink";
import { createTwoFilesPatch } from "diff";
import type { FileChange } from "../../../../core/entities/FileChange.js";

interface DiffViewProps {
  change: FileChange;
}

export function DiffView({ change }: DiffViewProps) {
  const label = `[${change.operation.toUpperCase()}] ${change.filePath}`;

  if (change.operation === "delete") {
    return (
      <Box flexDirection="column">
        <Text color="red" bold>{label}</Text>
      </Box>
    );
  }

  if (change.operation === "create") {
    const lines = (change.newContent ?? "").split("\n");
    return (
      <Box flexDirection="column">
        <Text color="green" bold>{label}</Text>
        {lines.slice(0, 30).map((line, i) => (
          <Text key={i} color="green">+ {line}</Text>
        ))}
        {lines.length > 30 && (
          <Text color="gray">  ...{lines.length - 30} more lines</Text>
        )}
      </Box>
    );
  }

  // modify — show unified diff
  const patch = createTwoFilesPatch(
    change.filePath,
    change.filePath,
    change.originalContent ?? "",
    change.newContent ?? "",
    "original",
    "modified",
  );

  const diffLines = patch.split("\n").slice(2); // skip header lines

  return (
    <Box flexDirection="column">
      <Text color="yellow" bold>{label}</Text>
      {diffLines.slice(0, 50).map((line, i) => {
        if (line.startsWith("+")) return <Text key={i} color="green">{line}</Text>;
        if (line.startsWith("-")) return <Text key={i} color="red">{line}</Text>;
        if (line.startsWith("@@")) return <Text key={i} color="cyan">{line}</Text>;
        return <Text key={i} color="gray">{line}</Text>;
      })}
      {diffLines.length > 50 && (
        <Text color="gray">  ...{diffLines.length - 50} more lines</Text>
      )}
    </Box>
  );
}
