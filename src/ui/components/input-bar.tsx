import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputBarProps {
  onSubmit: (input: string) => void;
  isDisabled: boolean;
}

export function InputBar({ onSubmit, isDisabled }: InputBarProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setInput('');
    onSubmit(trimmed);
  };

  return (
    <Box borderStyle="round" borderColor={isDisabled ? 'gray' : 'cyan'} paddingX={1}>
      <Text color={isDisabled ? 'gray' : 'cyan'} bold>
        {'> '}
      </Text>
      <TextInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        placeholder={isDisabled ? 'Waiting for response...' : 'Type your message...'}
        focus={!isDisabled}
      />
    </Box>
  );
}
