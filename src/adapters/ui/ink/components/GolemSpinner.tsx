import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "../theme.js";

interface GolemSpinnerProps {
  message: string;
}

export function GolemSpinner({ message }: GolemSpinnerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box>
      <Text color={theme.brand}>
        <Spinner type="dots" />
      </Text>
      <Text> {message}</Text>
      <Text dimColor> ({elapsed}s)</Text>
    </Box>
  );
}
