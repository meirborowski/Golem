import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme, icons } from "../theme.js";

interface PendingToolCallLineProps {
  label: string;
  keyArg: string;
}

export function PendingToolCallLine({ label, keyArg }: PendingToolCallLineProps) {
  return (
    <Box>
      <Text>    </Text>
      <Text color={theme.toolLabel}>{icons.tool} </Text>
      <Text color={theme.toolLabel} bold>{label}</Text>
      <Text>  </Text>
      <Text color={theme.toolArg}>{keyArg}</Text>
      <Text>  </Text>
      <Text color={theme.brand}><Spinner type="dots" /></Text>
    </Box>
  );
}
