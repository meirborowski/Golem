import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Box, Text, Static, useApp, useInput } from 'ink';
import { useAppContext } from '../context/app-context.js';
import { useBus, useSubscribers } from '../context/bus-provider.js';
import { useBusMessages } from '../hooks/use-bus-messages.js';
import { useBusStreaming } from '../hooks/use-bus-streaming.js';
import { useBusApproval } from '../hooks/use-bus-approval.js';
import { useBusAgent } from '../hooks/use-bus-agent.js';
import { useBusTokenUsage } from '../hooks/use-bus-token-usage.js';
import { useBusSendMessage } from '../hooks/use-bus-send-message.js';
import { createEvent } from '../../bus/helpers.js';
import { handleCommand, getErrorHint, type CommandContext } from '../../core/command-handler.js';
import { Welcome } from './welcome.js';
import { Message } from './message.js';
import { InputBar } from './input-bar.js';
import { Spinner } from './spinner.js';
import { StatusBar } from './status-bar.js';
import { ApprovalPrompt } from './approval-prompt.js';
import { AgentProgress } from './agent-progress.js';

export function ChatView() {
  // Display-only values from context
  const { config, registry, activeModelName, activeProvider, switchModel, agent, switchAgent } = useAppContext();

  // Bus-driven state
  const bus = useBus();
  const { configManager } = useSubscribers();
  const messages = useBusMessages();
  const { isStreaming, streamingText, error } = useBusStreaming();
  const { pendingApproval, approve, deny } = useBusApproval();
  const agentMode = useBusAgent();
  const tokenUsage = useBusTokenUsage();
  const { sendMessage, sendAgentMessage, cancelAgent } = useBusSendMessage(agent);

  const [showWelcome, setShowWelcome] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const { exit } = useApp();

  // Emit ui:ready on mount so McpBridge starts connecting
  useEffect(() => {
    void bus.emit(createEvent('ui:ready', {}));
  }, [bus]);

  /** Emit a system message via the bus. */
  const emitSystemMessage = useCallback(
    (content: string) => {
      void bus.emit(createEvent('command:result', {
        command: '',
        output: content,
        isError: false,
      }));
    },
    [bus],
  );

  const isAgentRunning = agentMode?.status === 'running';

  // Allow Escape to cancel agent mode
  useInput((_input, key) => {
    if (key.escape && isAgentRunning) {
      cancelAgent();
    }
  }, { isActive: isAgentRunning });

  const handleSubmit = (input: string) => {
    if (showWelcome) setShowWelcome(false);

    // Slash command handling
    if (input.startsWith('/')) {
      const providerNames = configManager.listProviders();
      const providers = providerNames.map((name) => {
        const entry = configManager.getProvider(name);
        return { name, defaultModel: entry?.defaultModel ?? 'unknown' };
      });

      const context: CommandContext = {
        messages,
        tokenUsage,
        config,
        currentSessionId,
        activeProvider,
        activeModelName,
        agentName: agent.name,
        agentDescription: agent.description,
        providers,
      };

      const result = handleCommand(input, context, registry);

      switch (result.type) {
        case 'message':
          emitSystemMessage(result.content);
          return;

        case 'clear':
          void bus.emit(createEvent('history:cleared', {}));
          setCurrentSessionId(null);
          setShowWelcome(true);
          return;

        case 'exit':
          exit();
          return;

        case 'session-saved':
          setCurrentSessionId(result.sessionId);
          emitSystemMessage(result.content);
          return;

        case 'session-loaded':
          setCurrentSessionId(result.sessionId);
          setShowWelcome(false);
          emitSystemMessage(result.content);
          return;

        case 'model-switched':
          try {
            switchModel(result.provider, result.model);
            emitSystemMessage(result.content);
          } catch (err) {
            emitSystemMessage(
              `Failed to switch model: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          return;

        case 'agent-switched':
          switchAgent(result.agent);
          emitSystemMessage(result.content);
          return;

        case 'error':
          emitSystemMessage(result.content);
          return;

        case 'unknown-command':
          emitSystemMessage(
            `Unknown command: /${result.command}. Type /help for available commands.`,
          );
          return;

        case 'not-a-command':
          break;
      }
    }

    // Regular messages
    if (config.agent && config.agent !== 'default') {
      sendAgentMessage(input);
    } else {
      sendMessage(input);
    }
  };

  // Completed messages = all messages (active streaming is separate)
  const completedMessages = useMemo(() => {
    return messages.map((msg, i) => ({ ...msg, _key: i }));
  }, [messages]);

  // Active streaming message (constructed from streamingText, not from messages array)
  const activeMessage = isStreaming
    ? { role: 'assistant' as const, content: streamingText, timestamp: Date.now() }
    : null;

  // Determine spinner label
  const spinnerLabel = isStreaming ? 'Thinking...' : '';

  // MCP server count — tracked by McpBridge subscriber via bus events
  // TODO: derive from mcp:connected events
  const mcpServerCount = Object.keys(config.mcpServers).length;

  return (
    <>
      {/* Static: rendered once, never redrawn */}
      <Static items={completedMessages}>
        {(msg, i) => {
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

        {isAgentRunning && agentMode && (
          <AgentProgress agentMode={agentMode} />
        )}

        {isStreaming && !pendingApproval && !agentMode && <Spinner label={spinnerLabel} />}

        {pendingApproval && (
          <ApprovalPrompt approval={pendingApproval} onApprove={approve} onDeny={deny} />
        )}

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
