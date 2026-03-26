import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme, box, icons } from "../theme.js";

interface StreamingTextProps {
  buffer: string;
}

export function StreamingText({ buffer }: StreamingTextProps) {
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  if (!buffer) return null;

  return (
    <Box>
      <Text color={theme.brand}>{box.vertical} </Text>
      <Text>
        {buffer}
        {cursorVisible ? <Text color={theme.brand}>{icons.cursor}</Text> : " "}
      </Text>
    </Box>
  );
}
