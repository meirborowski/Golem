import React, { useState, useMemo } from 'react';
import { Box, Text, Static, useApp } from 'ink';
import { useAppContext } from '../context/app-context.js';
import { useConversation } from '../hooks/use-conversation.js';
import { saveSession, loadSession, listSessions } from '../../core/session.js';
import { listProviders, getProvider } from '../../core/provider-registry.js';
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
  '  /model [name]      Show or switch model (e.g. /model gpt-4o, /model openai/gpt-4o)',
  '  /models            List available providers and their default models',
  '  /provider [name]   Show or switch provider',
  '  /save              Save current session',
  '  /load [id]         Load a saved session (latest if no id)',
  '  /history           List saved sessions',
  '  /exit, /quit       Exit Golem',
].join('\n');

export function ChatView() {
  const { config, dispatch, state, activeModelName, activeProvider, switchModel } = useAppContext();
  const { messages, isStreaming, error, tokenUsage, sendMessage, loadSession: loadIntoEngine } =
    useConversation();
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

        case 'model': {
          if (!arg) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Current model: ${activeProvider}/${activeModelName}`,
            });
            return;
          }

          try {
            // Support "provider/model" or just "model" (stays on current provider)
            let newProvider = activeProvider;
            let newModel = arg;

            if (arg.includes('/')) {
              const parts = arg.split('/');
              newProvider = parts[0];
              newModel = parts.slice(1).join('/');
            }

            switchModel(newProvider, newModel);
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Switched to ${newProvider}/${newModel}`,
            });
          } catch (err) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Failed to switch model: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
          return;
        }

        case 'models': {
          const providers = listProviders();
          const lines = ['Available providers and default models:', ''];
          for (const name of providers) {
            const entry = getProvider(name);
            if (entry) {
              const active = name === activeProvider ? ' (active)' : '';
              lines.push(`  ${name}${active} — default: ${entry.defaultModel}`);
            }
          }
          lines.push('');
          lines.push('Usage: /model <model-name> or /model <provider>/<model>');
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: lines.join('\n') });
          return;
        }

        case 'provider': {
          if (!arg) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Current provider: ${activeProvider}`,
            });
            return;
          }

          try {
            switchModel(arg);
            const entry = getProvider(arg);
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Switched to ${arg}/${entry?.defaultModel ?? 'unknown'}`,
            });
          } catch (err) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Failed to switch provider: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
          return;
        }

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

  // Split messages: completed ones go to <Static>, the active one stays dynamic
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const isLastStreaming = isStreaming && lastMsg?.role === 'assistant';

  // Completed messages = all except the one currently being streamed
  const completedMessages = useMemo(() => {
    if (isLastStreaming) {
      return messages.slice(0, -1).map((msg, i) => ({ ...msg, _key: i }));
    }
    return messages.map((msg, i) => ({ ...msg, _key: i }));
  }, [messages, isLastStreaming]);

  const activeMessage = isLastStreaming ? lastMsg : null;

  return (
    <>
      {/* Static: rendered once, never redrawn — eliminates flicker on old messages */}
      <Static items={completedMessages}>
        {(msg, i) => {
          // Show welcome before the first message
          if (i === 0 && showWelcome) {
            return (
              <Box key={`welcome-${msg._key}`} flexDirection="column">
                <Welcome provider={activeProvider} model={activeModelName} cwd={config.cwd} />
                <Message message={msg} />
              </Box>
            );
          }
          return <Message key={`msg-${msg._key}`} message={msg} />;
        }}
      </Static>

      {/* Dynamic: only this part redraws during streaming */}
      <Box flexDirection="column">
        {completedMessages.length === 0 && showWelcome && (
          <Welcome provider={activeProvider} model={activeModelName} cwd={config.cwd} />
        )}

        {activeMessage && <Message message={activeMessage} isStreamingThis />}

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

        <StatusBar provider={activeProvider} model={activeModelName} tokenUsage={tokenUsage} />
      </Box>
    </>
  );
}
