import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import type { LanguageModel } from '../../core/types.js';
import type { ToolSet } from '../../core/tool-registry.js';
import { useAppContext } from '../context/app-context.js';
import { useConversation } from '../hooks/use-conversation.js';
import { Welcome } from './welcome.js';
import { Message } from './message.js';
import { InputBar } from './input-bar.js';
import { Spinner } from './spinner.js';
import { StatusBar } from './status-bar.js';

const HELP_TEXT = [
  'Available commands:',
  '  /help              Show this help message',
  '  /clear             Clear conversation history',
  '  /model             Show current model',
  '  /provider          Show current provider',
  '  /exit, /quit       Exit Golem',
].join('\n');

interface ChatViewProps {
  model: LanguageModel;
  tools: ToolSet;
  modelName: string;
}

export function ChatView({ model, tools, modelName }: ChatViewProps) {
  const { config, dispatch } = useAppContext();
  const { messages, isStreaming, error, tokenUsage, sendMessage } = useConversation(model, tools);
  const [showWelcome, setShowWelcome] = useState(true);
  const { exit } = useApp();

  const handleSubmit = (input: string) => {
    if (showWelcome) setShowWelcome(false);

    // Slash command handling
    if (input.startsWith('/')) {
      const [cmd, ...rest] = input.slice(1).split(/\s+/);
      const arg = rest.join(' ');

      switch (cmd) {
        case 'help':
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: HELP_TEXT });
          return;

        case 'exit':
        case 'quit':
          exit();
          return;

        case 'clear':
          dispatch({ type: 'CLEAR_MESSAGES' });
          setShowWelcome(true);
          return;

        case 'model':
          dispatch({
            type: 'ADD_SYSTEM_MESSAGE',
            content: arg
              ? `Model switching is not yet supported. Current model: ${modelName}`
              : `Current model: ${modelName}`,
          });
          return;

        case 'provider':
          dispatch({
            type: 'ADD_SYSTEM_MESSAGE',
            content: `Current provider: ${config.provider}`,
          });
          return;

        default:
          dispatch({
            type: 'ADD_SYSTEM_MESSAGE',
            content: `Unknown command: /${cmd}. Type /help for available commands.`,
          });
          return;
      }
    }

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
