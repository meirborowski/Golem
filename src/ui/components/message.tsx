import React, { memo } from 'react';
import { Box, Text } from 'ink';
import type { ChatMessage } from '../../core/types.js';
import { ToolCallDisplay } from './tool-call.js';
import { Markdown } from './markdown.js';

interface MessageProps {
  message: ChatMessage;
  isStreamingThis?: boolean; // true only for the message currently being streamed
}

function MessageInner({ message, isStreamingThis = false }: MessageProps) {
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
      {toolCalls?.map((tc) => (
        <Box key={tc.id} marginLeft={2} marginTop={0}>
          <ToolCallDisplay toolCall={tc} />
        </Box>
      ))}
      {content ? (
        <Box marginLeft={2} marginTop={0}>
          {role === 'assistant' && !isStreamingThis ? (
            <Markdown content={content} />
          ) : (
            <Text wrap="wrap">{content}</Text>
          )}
        </Box>
      ) : null}
    </Box>
  );
}

// Memoize so completed messages don't re-render when new tokens stream in
export const Message = memo(MessageInner, (prev, next) => {
  // Re-render only if the message itself changed or streaming state changed
  if (prev.isStreamingThis !== next.isStreamingThis) return false;
  if (prev.message !== next.message) return false;
  return true;
});
