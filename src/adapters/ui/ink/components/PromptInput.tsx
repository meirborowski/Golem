import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { theme, icons } from "../theme.js";

interface PromptInputProps {
  message: string;
  onSubmit: (text: string) => void;
}

export function PromptInput({ message, onSubmit }: PromptInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (text: string) => {
    onSubmit(text);
    setValue("");
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.brand} bold>{icons.prompt} </Text>
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      </Box>
      {!value && (
        <Text dimColor>  Type your request, or &apos;exit&apos; to quit</Text>
      )}
    </Box>
  );
}
