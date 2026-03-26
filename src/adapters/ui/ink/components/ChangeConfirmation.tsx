import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { DiffView } from "./DiffView.js";
import type { FileChange } from "#core/entities/FileChange.js";

interface ChangeConfirmationProps {
  changes: FileChange[];
  onConfirm: (approved: FileChange[]) => void;
}

export function ChangeConfirmation({ changes, onConfirm }: ChangeConfirmationProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(changes.map((_, i) => i)));
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<"overview" | "select">("overview");

  useInput((input, key) => {
    if (mode === "overview") {
      if (input === "y") {
        onConfirm(changes);
      } else if (input === "n") {
        onConfirm([]);
      } else if (input === "s") {
        setMode("select");
      }
    } else if (mode === "select") {
      if (key.upArrow) {
        setCursor((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setCursor((prev) => Math.min(changes.length - 1, prev + 1));
      } else if (input === " ") {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(cursor)) next.delete(cursor);
          else next.add(cursor);
          return next;
        });
      } else if (key.return) {
        onConfirm(changes.filter((_, i) => selected.has(i)));
      } else if (key.escape) {
        setMode("overview");
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">--- {changes.length} pending change(s) ---</Text>

      {changes.map((change, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          {mode === "select" && (
            <Text>
              {cursor === i ? ">" : " "} [{selected.has(i) ? "x" : " "}]{" "}
            </Text>
          )}
          <DiffView change={change} />
        </Box>
      ))}

      <Box marginTop={1}>
        {mode === "overview" ? (
          <Text color="gray">Press [y] approve all, [n] reject all, [s] select individually</Text>
        ) : (
          <Text color="gray">↑↓ navigate, space toggle, enter confirm, esc back</Text>
        )}
      </Box>
    </Box>
  );
}
