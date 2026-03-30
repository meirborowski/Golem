import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { theme, icons } from "../theme.js";

interface PromptInputProps {
  message: string;
  onSubmit: (text: string) => void;
}

const DEFAULT_PROMPT = "You> ";

export function PromptInput({ message, onSubmit }: PromptInputProps) {
  const [value, setValue] = useState("");
  const isToolPrompt = message !== DEFAULT_PROMPT;

  const handleSubmit = (text: string) => {
    onSubmit(text);
    setValue("");
  };

  return (
    <Box flexDirection="column">
      {isToolPrompt && (
        <Box marginTop={1}>
          <Text color={theme.accent}>{message}</Text>
        </Box>
      )}
      <Box>
        <Text color={theme.brand} bold>{icons.prompt} </Text>
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      </Box>
      {!value && !isToolPrompt && (
        <Text dimColor>  Type your request, or &apos;exit&apos; to quit</Text>
      )}
    </Box>
  );
}
