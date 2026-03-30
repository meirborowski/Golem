import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import type { TodoItem } from "#core/entities/TodoItem.js";

interface TodoListProps {
  items: TodoItem[];
}

const statusIcons: Record<TodoItem["status"], string> = {
  pending: "\u25CB",       // ○
  in_progress: "\u25C9",   // ◉
  completed: "\u2714",     // ✔
};

const statusColors: Record<TodoItem["status"], string> = {
  pending: theme.muted,
  in_progress: theme.brand,
  completed: theme.success,
};

export function TodoList({ items }: TodoListProps) {
  if (items.length === 0) return null;

  const inProgress = items.find((t) => t.status === "in_progress");

  return (
    <Box flexDirection="column" marginTop={0} marginBottom={0}>
      {inProgress && (
        <Box>
          <Text color={theme.brand}> {statusIcons.in_progress} </Text>
          <Text color={theme.brand}>{inProgress.content}</Text>
        </Box>
      )}
      {items
        .filter((t) => t !== inProgress)
        .map((item, i) => (
          <Box key={i}>
            <Text color={statusColors[item.status]}> {statusIcons[item.status]} </Text>
            <Text
              color={item.status === "completed" ? theme.success : theme.muted}
              dimColor={item.status === "completed"}
            >
              {item.content}
            </Text>
          </Box>
        ))}
    </Box>
  );
}
