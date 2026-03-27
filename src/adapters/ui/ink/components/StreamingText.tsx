import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { theme, box, icons } from "../theme.js";

const MAX_VISIBLE_LINES = 8;

interface StreamingTextProps {
  buffer: string;
}

export const StreamingText = React.memo(function StreamingText({ buffer }: StreamingTextProps) {
  if (!buffer) return null;

  const visibleText = useMemo(() => {
    const lines = buffer.split("\n");
    if (lines.length <= MAX_VISIBLE_LINES) return buffer;
    return lines.slice(-MAX_VISIBLE_LINES).join("\n");
  }, [buffer]);

  return (
    <Box flexDirection="column">
      {visibleText.split("\n").map((line, i) => (
        <Box key={i}>
          <Text color={theme.brand}>{box.vertical} </Text>
          <Text>
            {line}
            {i === visibleText.split("\n").length - 1 && (
              <Text color={theme.brand}>{icons.cursor}</Text>
            )}
          </Text>
        </Box>
      ))}
    </Box>
  );
});
