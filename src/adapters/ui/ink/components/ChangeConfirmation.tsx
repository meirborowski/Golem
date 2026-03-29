import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { DiffView, diffStats } from "./DiffView.js";
import { theme, box, icons } from "../theme.js";
import type { FileChange, FileChangeOperation } from "#core/entities/FileChange.js";

interface ChangeConfirmationProps {
  changes: FileChange[];
  onConfirm: (approved: FileChange[]) => void;
}

const opColor: Record<FileChangeOperation, string> = {
  create: theme.success,
  modify: theme.warning,
  delete: theme.error,
};

function panelTop(title: string, width: number): string {
  const inner = `${box.horizontal}${box.horizontal} ${title} `;
  const remaining = Math.max(0, width - inner.length - 2);
  return `${box.topLeft}${inner}${box.horizontal.repeat(remaining)}${box.topRight}`;
}

function panelBottom(hints: string, width: number): string {
  const inner = `${box.horizontal} ${hints} `;
  const remaining = Math.max(0, width - inner.length - 2);
  return `${box.bottomLeft}${inner}${box.horizontal.repeat(remaining)}${box.bottomRight}`;
}

function buildSummary(changes: FileChange[]): string {
  const counts: Partial<Record<FileChangeOperation, number>> = {};
  for (const c of changes) {
    counts[c.operation] = (counts[c.operation] ?? 0) + 1;
  }
  const parts: string[] = [];
  if (counts.modify) parts.push(`${counts.modify} modified`);
  if (counts.create) parts.push(`${counts.create} created`);
  if (counts.delete) parts.push(`${counts.delete} deleted`);
  return parts.join(" \u00B7 ");
}

export function ChangeConfirmation({ changes, onConfirm }: ChangeConfirmationProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(changes.map((_, i) => i)));
  const [focusIndex, setFocusIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<"overview" | "select">("overview");

  const width = Math.min(process.stdout.columns || 80, 100);

  // Keep refs in sync so the stable useInput callback always reads fresh values
  const modeRef = useRef(mode);
  const focusRef = useRef(focusIndex);
  const selectedRef = useRef(selected);
  modeRef.current = mode;
  focusRef.current = focusIndex;
  selectedRef.current = selected;

  // In select mode, auto-expand focused file
  useEffect(() => {
    if (mode === "select") {
      setExpandedIndex(focusIndex);
    }
  }, [focusIndex, mode]);

  // Stable handler — never changes, reads state via refs
  const handleInput = useCallback((input: string, key: { upArrow: boolean; downArrow: boolean; return: boolean; escape: boolean }) => {
    const m = modeRef.current;
    const fi = focusRef.current;
    const maxIdx = changes.length - 1;

    // Navigation (both modes)
    if (key.upArrow || (input === "k" && m === "overview")) {
      setFocusIndex(Math.max(0, fi - 1));
      return;
    }
    if (key.downArrow || (input === "j" && m === "overview")) {
      setFocusIndex(Math.min(maxIdx, fi + 1));
      return;
    }

    if (m === "overview") {
      if (input === "y") {
        onConfirm(changes);
      } else if (input === "n") {
        onConfirm([]);
      } else if (input === "s") {
        setMode("select");
      } else if (key.return) {
        setExpandedIndex((prev) => (prev === fi ? null : fi));
      }
    } else if (m === "select") {
      if (input === " ") {
        const sel = selectedRef.current;
        const next = new Set(sel);
        if (next.has(fi)) next.delete(fi);
        else next.add(fi);
        setSelected(next);
      } else if (key.return) {
        const sel = selectedRef.current;
        onConfirm(changes.filter((_, i) => sel.has(i)));
      } else if (key.escape) {
        setMode("overview");
        setExpandedIndex(null);
      }
    }
  }, [changes, onConfirm]);

  useInput(handleInput);

  const overviewHints = "y approve all \u2502 n reject \u2502 s select \u2502 j/k browse \u2502 \u23CE expand";
  const selectHints = "\u2191\u2193 navigate \u2502 space toggle \u2502 \u23CE confirm \u2502 esc back";
  const hints = mode === "overview" ? overviewHints : selectHints;

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Top border */}
      <Text color={theme.brand}>{panelTop("Pending Changes", width)}</Text>

      {/* Summary line */}
      <Text>
        <Text color={theme.brand}>{box.vertical}</Text>
        {"  "}
        <Text bold>{changes.length} file{changes.length !== 1 ? "s" : ""}</Text>
        {"  "}
        <Text dimColor>{buildSummary(changes)}</Text>
      </Text>

      {/* Separator */}
      <Text color={theme.brand}>
        {box.vertical}
        {"  "}
        <Text dimColor>{box.horizontal.repeat(width - 4)}</Text>
      </Text>

      {/* File list */}
      {changes.map((change, i) => {
        const focused = focusIndex === i;
        const expanded = expandedIndex === i;
        const stats = diffStats(change);
        const op = change.operation.toUpperCase();
        const statsStr = change.operation === "delete"
          ? `-${stats.removed}`
          : change.operation === "create"
            ? `+${stats.added}`
            : `+${stats.added} -${stats.removed}`;

        return (
          <Box key={i} flexDirection="column">
            {/* File row */}
            <Text>
              <Text color={theme.brand}>{box.vertical}</Text>
              {"  "}
              {mode === "select" && (
                <Text>
                  <Text color={focused ? theme.accent : theme.muted}>
                    [{selected.has(i) ? "x" : " "}]
                  </Text>
                  {" "}
                </Text>
              )}
              <Text color={focused ? theme.accent : theme.muted}>
                {focused ? icons.arrow : " "}
              </Text>
              {" "}
              <Text color={opColor[change.operation]} bold>[{op}]</Text>
              {" "}
              <Text>{change.filePath}</Text>
              {"  "}
              <Text dimColor>{statsStr}</Text>
            </Text>

            {/* Description (if present) */}
            {change.description && (
              <Text>
                <Text color={theme.brand}>{box.vertical}</Text>
                {"      "}
                <Text dimColor>{change.description}</Text>
              </Text>
            )}

            {/* Expanded diff */}
            {expanded && (
              <Box flexDirection="column">
                <Text>
                  <Text color={theme.brand}>{box.vertical}</Text>
                  {"  "}
                  <Text dimColor>{"┄".repeat(width - 4)}</Text>
                </Text>
                <Box paddingLeft={4}>
                  <DiffView change={change} />
                </Box>
                <Text>
                  <Text color={theme.brand}>{box.vertical}</Text>
                  {"  "}
                  <Text dimColor>{"┄".repeat(width - 4)}</Text>
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Bottom border with hints */}
      <Text color={theme.muted}>{panelBottom(hints, width)}</Text>
    </Box>
  );
}
