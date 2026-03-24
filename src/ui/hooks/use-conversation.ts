import { useCallback, useRef, useEffect } from 'react';
import { useAppContext } from '../context/app-context.js';
import { ConversationEngine } from '../../core/conversation.js';
import { createBuiltinTools, getToolMeta } from '../../core/tool-registry.js';
import { summarizeToolResult, isToolError } from '../../core/stream-utils.js';
import { formatArgs } from '../../utils/format-args.js';
import type { AgentTodoItem, ApprovalCallback, ChatMessage, TokenUsage, TurnResult, SendMessageOptions, ToolCallInfo } from '../../core/types.js';
import type { ModelMessage } from 'ai';

const FLUSH_INTERVAL_MS = 32; // ~30fps — batch text deltas into ~32ms chunks

export function useConversation() {
  const { state, dispatch, config, registry, activeModel, mcpManager, agent } = useAppContext();

  // Keep a stable ref to dispatch so the approval callback never goes stale
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // Keep a stable ref to mcpManager for the approval callback
  const mcpManagerRef = useRef(mcpManager);
  mcpManagerRef.current = mcpManager;

  const approvalCallback = useCallback<ApprovalCallback>(
    (toolName, toolCallId, args) => {
      return new Promise<boolean>((resolve) => {
        // Detect MCP server from namespaced tool name
        const mcpServer = mcpManagerRef.current?.toolDescriptions.find(
          (td) => td.name === toolName,
        )?.server;

        dispatchRef.current({
          type: 'SET_PENDING_APPROVAL',
          approval: { toolCallId, toolName, args, resolve, mcpServer },
        });
      });
    },
    [],
  );

  const engineRef = useRef<ConversationEngine | null>(null);

  // Lazily create the engine with approval-wrapped tools
  if (!engineRef.current) {
    const builtinTools = createBuiltinTools(config, registry, approvalCallback, agent.tools);
    const mcpTools = mcpManager?.tools ?? {};
    const allTools = { ...builtinTools, ...mcpTools };

    // Populate agent toolMeta from the created tools
    agent.toolMeta = getToolMeta(allTools);

    engineRef.current = new ConversationEngine(activeModel, allTools, config, agent);
    engineRef.current.setRegistry(registry);
    if (mcpManager) {
      engineRef.current.setMcpToolDescriptions(mcpManager.toolDescriptions);
    }
  }

  // When the active model changes, update the engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setModel(activeModel);
    }
  }, [activeModel]);

  // When MCP tools become available after engine creation, merge them in
  useEffect(() => {
    if (engineRef.current && mcpManager) {
      engineRef.current.mergeTools(mcpManager.tools);
      engineRef.current.setMcpToolDescriptions(mcpManager.toolDescriptions);
    }
  }, [mcpManager]);

  // Text buffer for batching APPEND_CHUNK dispatches
  const textBufferRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushTextBuffer = useCallback(() => {
    if (textBufferRef.current) {
      dispatchRef.current({ type: 'APPEND_CHUNK', text: textBufferRef.current });
      textBufferRef.current = '';
    }
    flushTimerRef.current = null;
  }, []);

  const appendText = useCallback(
    (text: string) => {
      textBufferRef.current += text;
      // Schedule a flush if one isn't already pending
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(flushTextBuffer, FLUSH_INTERVAL_MS);
      }
    },
    [flushTextBuffer],
  );

  const sendMessage = useCallback(
    async (input: string, options?: SendMessageOptions): Promise<TurnResult> => {
      const isBackground = options?.background === true;
      const turnResult: TurnResult = {
        hadToolCalls: false,
        agentDoneCalled: false,
        hadTextOutput: false,
        errorCount: 0,
        finalText: '',
        toolCalls: [],
        lastError: '',
      };

      if (!engineRef.current) return turnResult;

      // In background mode, isStreaming is never set, so skip the guard
      if (!isBackground && state.isStreaming) return turnResult;

      if (!isBackground) {
        if (!options?.silent) {
          dispatch({ type: 'ADD_USER_MESSAGE', content: input });
        }
        dispatch({ type: 'START_STREAMING' });
        dispatch({ type: 'ADD_ASSISTANT_MESSAGE' });
      }

      // Local collectors for background mode
      let collectedText = '';
      const collectedToolCalls: ToolCallInfo[] = [];
      // Track tool call start times for duration measurement
      const toolStartTimes = new Map<string, number>();

      try {
        for await (const event of engineRef.current.sendMessage(input)) {
          switch (event.type) {
            case 'text-delta':
              turnResult.hadTextOutput = true;
              if (isBackground) {
                collectedText += event.text;
              } else if (!options?.suppressText) {
                appendText(event.text);
              }
              break;

            case 'tool-call': {
              if (!isBackground) {
                flushTextBuffer();
              }
              turnResult.hadToolCalls = true;
              if (event.toolName === 'agentDone') {
                turnResult.agentDoneCalled = true;
              }

              const now = Date.now();
              toolStartTimes.set(event.toolCallId, now);

              if (isBackground) {
                collectedToolCalls.push({
                  id: event.toolCallId,
                  toolName: event.toolName,
                  args: event.args,
                  status: 'running' as const,
                  startedAt: now,
                });
                dispatch({
                  type: 'AGENT_TOOL_START',
                  toolName: event.toolName,
                  argsPreview: formatArgs(event.args),
                });
              } else {
                dispatch({
                  type: 'ADD_TOOL_CALL',
                  toolCall: {
                    id: event.toolCallId,
                    toolName: event.toolName,
                    args: event.args,
                    status: 'running',
                    startedAt: now,
                  },
                });
              }
              break;
            }

            case 'tool-result': {
              const toolError = isToolError(event.result);
              const toolStatus = toolError ? 'error' as const : 'completed' as const;
              const startTime = toolStartTimes.get(event.toolCallId);
              const durationMs = startTime != null ? Date.now() - startTime : undefined;
              toolStartTimes.delete(event.toolCallId);

              if (isBackground) {
                const tc = collectedToolCalls.find((t) => t.id === event.toolCallId);
                if (tc) {
                  tc.result = summarizeToolResult(event.result);
                  tc.status = toolStatus;
                  tc.durationMs = durationMs;
                }
                dispatch({
                  type: 'AGENT_TOOL_DONE',
                  toolName: event.toolName,
                  status: toolStatus,
                  durationMs,
                });
                // Update live todo list from todoManager results
                if (event.toolName === 'todoManager' && event.result != null && typeof event.result === 'object') {
                  const res = event.result as Record<string, unknown>;
                  if (Array.isArray(res['items'])) {
                    dispatch({
                      type: 'AGENT_UPDATE_TODOS',
                      todos: res['items'] as AgentTodoItem[],
                    });
                  }
                }
              } else {
                dispatch({
                  type: 'UPDATE_TOOL_CALL',
                  toolCallId: event.toolCallId,
                  update: { result: summarizeToolResult(event.result), status: toolStatus, durationMs },
                });
              }
              break;
            }

            case 'finish':
              if (!isBackground) {
                flushTextBuffer();
                dispatch({ type: 'FINISH_STREAMING', usage: event.usage });
              }
              break;

            case 'error':
              if (!isBackground) {
                flushTextBuffer();
              }
              turnResult.errorCount++;
              turnResult.lastError = event.error.message;
              if (!isBackground) {
                dispatch({ type: 'SET_ERROR', error: event.error.message });
              }
              break;
          }
        }
      } catch (error) {
        if (!isBackground) {
          flushTextBuffer();
        }
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        turnResult.errorCount++;
        turnResult.lastError = errMsg;
        if (!isBackground) {
          dispatch({ type: 'SET_ERROR', error: errMsg });
        }
      }

      turnResult.finalText = collectedText;
      turnResult.toolCalls = collectedToolCalls;
      return turnResult;
    },
    [state.isStreaming, dispatch, appendText, flushTextBuffer],
  );

  const loadSession = useCallback(
    (messages: ChatMessage[], tokenUsage: TokenUsage) => {
      if (!engineRef.current) return;

      // Convert ChatMessages to CoreMessages for the engine
      const coreMessages: ModelMessage[] = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      engineRef.current.loadHistory(coreMessages, tokenUsage);
      dispatch({ type: 'LOAD_SESSION', messages, tokenUsage });
    },
    [dispatch],
  );

  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    error: state.error,
    tokenUsage: state.tokenUsage,
    sendMessage,
    loadSession,
  };
}
