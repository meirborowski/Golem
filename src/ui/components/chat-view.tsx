import React, { useState } from 'react';
import { Box, Text } from 'ink';
import type { LanguageModel } from '../../core/types.js';
import type { ToolSet } from '../../core/tool-registry.js';
import { useAppContext } from '../context/app-context.js';
import { useConversation } from '../hooks/use-conversation.js';
import { Welcome } from './welcome.js';
import { Message } from './message.js';
import { InputBar } from './input-bar.js';
import { Spinner } from './spinner.js';
import { StatusBar } from './status-bar.js';

interface ChatViewProps {
  model: LanguageModel;
  tools: ToolSet;
  modelName: string;
}

export function ChatView({ model, tools, modelName }: ChatViewProps) {
  const { config } = useAppContext();
  const { messages, isStreaming, error, tokenUsage, sendMessage } = useConversation(model, tools);
  const [showWelcome, setShowWelcome] = useState(true);

  const handleSubmit = (input: string) => {
    if (showWelcome) setShowWelcome(false);
    sendMessage(input);
  };

  return (
    <Box flexDirection="column">
      {showWelcome && (
        <Welcome provider={config.provider} model={modelName} cwd={config.cwd} />
      )}

      {messages.map((msg, i) => (
        <Message key={i} message={msg} />
      ))}

      {isStreaming && <Spinner />}

      {error && (
        <Box marginLeft={2} marginBottom={1}>
          <Box borderStyle="round" borderColor="red" paddingX={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        </Box>
      )}

      <InputBar onSubmit={handleSubmit} isDisabled={isStreaming} />

      <StatusBar provider={config.provider} model={modelName} tokenUsage={tokenUsage} />
    </Box>
  );
}
