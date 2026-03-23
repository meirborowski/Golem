import React, { useState, useMemo } from 'react';
import { Box, Text, Static, useApp, useInput } from 'ink';
import { useAppContext } from '../context/app-context.js';
import { useAgent } from '../hooks/use-agent.js';
import { saveSession, loadSession, listSessions, exportToMarkdown } from '../../core/session.js';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listProviders, getProvider } from '../../core/provider-registry.js';
import { loadAgent, listAgentNames } from '../../agents/agent-loader.js';
import { Welcome } from './welcome.js';
import { Message } from './message.js';
import { InputBar } from './input-bar.js';
import { Spinner } from './spinner.js';
import { StatusBar } from './status-bar.js';
import { ApprovalPrompt } from './approval-prompt.js';
import { AgentProgress } from './agent-progress.js';

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
  '  /export [path]     Export conversation as markdown',
  '  /agent [name]      Show or switch agent config',
  '  /agents            List available agents',
  '  /exit, /quit       Exit Golem',
].join('\n');

function getErrorHint(error: string): string | null {
  const lower = error.toLowerCase();
  if (lower.includes('api key') || lower.includes('authentication') || lower.includes('401')) {
    return 'Check your API key in config or environment variables.';
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return 'Rate limited. Wait a moment and try again.';
  }
  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('fetch failed')) {
    return 'Network error. Check your internet connection.';
  }
  if (lower.includes('context') || lower.includes('too long') || lower.includes('token')) {
    return 'Context limit exceeded. Try /clear to start fresh.';
  }
  return null;
}

export function ChatView() {
  const { config, dispatch, state, activeModelName, activeProvider, switchModel, mcpManager, agent, switchAgent } = useAppContext();
  const { messages, isStreaming, error, tokenUsage, sendMessage, cancelAgent, loadSession: loadIntoEngine } =
    useAgent();
  const [showWelcome, setShowWelcome] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const { exit } = useApp();

  const isAgentRunning = state.agentMode?.status === 'running';

  // Allow Escape to cancel agent mode
  useInput((_input, key) => {
    if (key.escape && isAgentRunning) {
      cancelAgent();
    }
  }, { isActive: isAgentRunning });

  const handleSubmit = (input: string) => {
    if (showWelcome) setShowWelcome(false);
    if (state.error) dispatch({ type: 'CLEAR_ERROR' });

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

        case 'export': {
          if (messages.length === 0) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: 'Nothing to export — no messages in this session.',
            });
            return;
          }

          try {
            const markdown = exportToMarkdown(messages, activeProvider, activeModelName);
            const filename = arg || `golem-export-${new Date().toISOString().slice(0, 10)}.md`;
            const filePath = resolve(config.cwd, filename);
            writeFileSync(filePath, markdown, 'utf-8');
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Exported ${messages.length} messages to ${filePath}`,
            });
          } catch (err) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Failed to export: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
          return;
        }

        case 'agent': {
          if (!arg) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Current agent: ${agent.name} — ${agent.description}`,
            });
            return;
          }

          const newAgent = loadAgent(arg, config.cwd);
          if (!newAgent) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Agent not found: "${arg}". Use /agents to list available agents.`,
            });
            return;
          }

          switchAgent(newAgent);
          dispatch({
            type: 'ADD_SYSTEM_MESSAGE',
            content: `Switched to agent: ${newAgent.name} — ${newAgent.description}`,
          });
          return;
        }

        case 'agents': {
          const names = listAgentNames(config.cwd);
          if (names.length === 0) {
            dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: 'No agents found.' });
            return;
          }

          const lines = ['Available agents:', ''];
          for (const name of names) {
            const loaded = loadAgent(name, config.cwd);
            const active = name === agent.name ? ' (active)' : '';
            lines.push(`  ${name}${active}${loaded ? ` — ${loaded.description}` : ''}`);
          }
          lines.push('');
          lines.push('Usage: /agent <name>');
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

  // Determine spinner label based on current state
  const spinnerLabel = (() => {
    const last = messages[messages.length - 1];
    if (last?.toolCalls?.some((tc) => tc.status === 'running')) {
      return 'Running tools...';
    }
    return 'Thinking...';
  })();

  // Count unique MCP servers
  const mcpServerCount = mcpManager
    ? new Set(mcpManager.toolDescriptions.map((td) => td.server)).size
    : 0;

  return (
    <>
      {/* Static: rendered once, never redrawn — eliminates flicker on old messages */}
      <Static items={completedMessages}>
        {(msg, i) => {
          // Show welcome before the first message
          if (i === 0 && showWelcome) {
            return (
              <Box key={`welcome-${msg._key}`} flexDirection="column">
                <Welcome
                  provider={activeProvider}
                  model={activeModelName}
                  cwd={config.cwd}
                  debug={config.debug}
                  mcpServerCount={mcpServerCount}
                />
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
          <Welcome
            provider={activeProvider}
            model={activeModelName}
            cwd={config.cwd}
            debug={config.debug}
            mcpServerCount={mcpServerCount}
          />
        )}

        {activeMessage && <Message message={activeMessage} isStreamingThis />}

        {isAgentRunning && (
          <AgentProgress agentMode={state.agentMode!} />
        )}

        {isStreaming && !state.pendingApproval && !state.agentMode && <Spinner label={spinnerLabel} />}

        {state.pendingApproval && <ApprovalPrompt approval={state.pendingApproval} />}

        {error && (
          <Box marginLeft={2} marginBottom={1} flexDirection="column">
            <Box borderStyle="round" borderColor="red" paddingX={1} flexDirection="column">
              <Text color="red">Error: {error}</Text>
              {getErrorHint(error) && (
                <Text dimColor>{getErrorHint(error)}</Text>
              )}
            </Box>
          </Box>
        )}

        <InputBar
          onSubmit={handleSubmit}
          isDisabled={isStreaming || isAgentRunning}
          isAgentMode={isAgentRunning}
        />

        <StatusBar
          provider={activeProvider}
          model={activeModelName}
          tokenUsage={tokenUsage}
          contextWindow={config.contextWindow}
        />
      </Box>
    </>
  );
}
