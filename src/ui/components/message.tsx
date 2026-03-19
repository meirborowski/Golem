import React from 'react';
import { Box, Text } from 'ink';
import type { ChatMessage } from '../../core/types.js';
import { ToolCallDisplay } from './tool-call.js';
import { Markdown } from './markdown.js';

interface MessageProps {
  message: ChatMessage;
}

export function Message({ message }: MessageProps) {
  const { role, content, toolCalls } = message;

  const roleLabel =
    role === 'user' ? (
      <Text bold color="blue">
        You
      </Text>
    ) : role === 'assistant' ? (
      <Text bold color="green">
        Golem
      </Text>
    ) : (
      <Text bold color="yellow">
        System
      </Text>
    );

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        {roleLabel}
        <Text dimColor> ─────</Text>
      </Box>
      {content ? (
        <Box marginLeft={2} marginTop={0}>
          {role === 'assistant' ? (
            <Markdown content={content} />
          ) : (
            <Text wrap="wrap">{content}</Text>
          )}
        </Box>
      ) : null}
      {toolCalls?.map((tc) => (
        <Box key={tc.id} marginLeft={2} marginTop={0}>
          <ToolCallDisplay toolCall={tc} />
        </Box>
      ))}
    </Box>
  );
}
