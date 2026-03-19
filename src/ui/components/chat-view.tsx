import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import type { LanguageModel } from '../../core/types.js';
import { useAppContext } from '../context/app-context.js';
import { useConversation } from '../hooks/use-conversation.js';
import { saveSession, loadSession, listSessions } from '../../core/session.js';
import { Welcome } from './welcome.js';
import { Message } from './message.js';
import { InputBar } from './input-bar.js';
import { Spinner } from './spinner.js';
import { StatusBar } from './status-bar.js';
import { ApprovalPrompt } from './approval-prompt.js';

const HELP_TEXT = [
  'Available commands:',
  '  /help              Show this help message',
  '  /clear             Clear conversation history',
  '  /model             Show current model',
  '  /provider          Show current provider',
  '  /save              Save current session',
  '  /load [id]         Load a saved session (latest if no id)',
  '  /history           List saved sessions',
  '  /exit, /quit       Exit Golem',
].join('\n');

interface ChatViewProps {
  model: LanguageModel;
  modelName: string;
}

export function ChatView({ model, modelName }: ChatViewProps) {
  const { config, dispatch, state } = useAppContext();
  const { messages, isStreaming, error, tokenUsage, sendMessage, loadSession: loadIntoEngine } =
    useConversation(model);
  const [showWelcome, setShowWelcome] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
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
          // Auto-save before exit if there are messages
          if (messages.length > 0) {
            try {
              saveSession(messages, tokenUsage, config, currentSessionId ?? undefined);
            } catch {
              // Silently ignore save errors on exit
            }
          }
          exit();
          return;

        case 'clear':
          dispatch({ type: 'CLEAR_MESSAGES' });
          setCurrentSessionId(null);
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

        case 'save': {
          if (messages.length === 0) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: 'Nothing to save — no messages in this session.',
            });
            return;
          }
          try {
            const session = saveSession(
              messages,
              tokenUsage,
              config,
              currentSessionId ?? undefined,
            );
            setCurrentSessionId(session.id);
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Session saved: ${session.id} (${session.messages.length} messages)`,
            });
          } catch (err) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
          return;
        }

        case 'load': {
          try {
            let sessionId = arg;
            if (!sessionId) {
              // Load latest session
              const sessions = listSessions(1);
              if (sessions.length === 0) {
                dispatch({
                  type: 'ADD_SYSTEM_MESSAGE',
                  content: 'No saved sessions found.',
                });
                return;
              }
              sessionId = sessions[0].id;
            }

            const session = loadSession(sessionId);
            if (!session) {
              dispatch({
                type: 'ADD_SYSTEM_MESSAGE',
                content: `Session not found: ${sessionId}`,
              });
              return;
            }

            loadIntoEngine(session.messages, session.tokenUsage);
            setCurrentSessionId(session.id);
            setShowWelcome(false);
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Loaded session: ${session.id} (${session.messages.length} messages, ${session.provider}/${session.model})`,
            });
          } catch (err) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Failed to load: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
          return;
        }

        case 'history': {
          const sessions = listSessions();
          if (sessions.length === 0) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: 'No saved sessions found.',
            });
            return;
          }

          const lines = ['Saved sessions:', ''];
          for (const s of sessions) {
            const date = new Date(s.updatedAt).toLocaleString();
            const active = s.id === currentSessionId ? ' (current)' : '';
            lines.push(`  ${s.id}${active}`);
            lines.push(`    ${date} | ${s.provider}/${s.model} | ${s.messageCount} msgs`);
            lines.push(`    ${s.preview}`);
            lines.push('');
          }
          lines.push('Use /load <id> to load a session.');

          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: lines.join('\n') });
          return;
        }

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

      {isStreaming && !state.pendingApproval && <Spinner />}

      {state.pendingApproval && <ApprovalPrompt approval={state.pendingApproval} />}

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
