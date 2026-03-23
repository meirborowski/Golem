import React, { useState, useMemo } from 'react';
import { Box, Text, Static, useApp, useInput } from 'ink';
import { useAppContext } from '../context/app-context.js';
import { useAgent } from '../hooks/use-agent.js';
import { handleCommand, getErrorHint, type CommandContext } from '../../core/command-handler.js';
import { Welcome } from './welcome.js';
import { Message } from './message.js';
import { InputBar } from './input-bar.js';
import { Spinner } from './spinner.js';
import { StatusBar } from './status-bar.js';
import { ApprovalPrompt } from './approval-prompt.js';
import { AgentProgress } from './agent-progress.js';

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
      const context: CommandContext = {
        messages,
        tokenUsage,
        config,
        currentSessionId,
        activeProvider,
        activeModelName,
        agentName: agent.name,
        agentDescription: agent.description,
      };

      const result = handleCommand(input, context);

      switch (result.type) {
        case 'message':
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: result.content });
          return;

        case 'clear':
          dispatch({ type: 'CLEAR_MESSAGES' });
          setCurrentSessionId(null);
          setShowWelcome(true);
          return;

        case 'exit':
          exit();
          return;

        case 'session-saved':
          setCurrentSessionId(result.sessionId);
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: result.content });
          return;

        case 'session-loaded':
          loadIntoEngine(result.messages, result.tokenUsage);
          setCurrentSessionId(result.sessionId);
          setShowWelcome(false);
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: result.content });
          return;

        case 'model-switched':
          try {
            switchModel(result.provider, result.model);
            dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: result.content });
          } catch (err) {
            dispatch({
              type: 'ADD_SYSTEM_MESSAGE',
              content: `Failed to switch model: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
          return;

        case 'agent-switched':
          switchAgent(result.agent);
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: result.content });
          return;

        case 'error':
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: result.content });
          return;

        case 'unknown-command':
          dispatch({
            type: 'ADD_SYSTEM_MESSAGE',
            content: `Unknown command: /${result.command}. Type /help for available commands.`,
          });
          return;

        case 'not-a-command':
          break;
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
