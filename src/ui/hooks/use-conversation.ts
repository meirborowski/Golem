import { useCallback, useRef, useEffect } from 'react';
import { useAppContext } from '../context/app-context.js';
import { ConversationEngine } from '../../core/conversation.js';
import { createBuiltinTools } from '../../core/tool-registry.js';
import { formatArgs } from '../../utils/format-args.js';
import type { ApprovalCallback, ChatMessage, TokenUsage, TurnResult, SendMessageOptions, ToolCallInfo } from '../../core/types.js';
import type { ModelMessage } from 'ai';

const FLUSH_INTERVAL_MS = 32; // ~30fps — batch text deltas into ~32ms chunks

export function useConversation() {
  const { state, dispatch, config, activeModel } = useAppContext();

  // Keep a stable ref to dispatch so the approval callback never goes stale
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const approvalCallback = useCallback<ApprovalCallback>(
    (toolName, toolCallId, args) => {
      return new Promise<boolean>((resolve) => {
        dispatchRef.current({
          type: 'SET_PENDING_APPROVAL',
          approval: { toolCallId, toolName, args, resolve },
        });
      });
    },
    [],
  );

  const engineRef = useRef<ConversationEngine | null>(null);

  // Lazily create the engine with approval-wrapped tools
  if (!engineRef.current) {
    const tools = createBuiltinTools(config, approvalCallback);
    engineRef.current = new ConversationEngine(activeModel, tools, config);
  }

  // When the active model changes, update the engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setModel(activeModel);
    }
  }, [activeModel]);

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

              if (isBackground) {
                collectedToolCalls.push({
                  id: event.toolCallId,
                  toolName: event.toolName,
                  args: event.args,
                  status: 'running',
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
                  },
                });
              }
              break;
            }

            case 'tool-result': {
              if (isBackground) {
                const tc = collectedToolCalls.find((t) => t.id === event.toolCallId);
                if (tc) {
                  tc.result = event.result;
                  tc.status = 'completed';
                }
                dispatch({
                  type: 'AGENT_TOOL_DONE',
                  toolName: event.toolName,
                  status: 'completed',
                });
              } else {
                dispatch({
                  type: 'UPDATE_TOOL_CALL',
                  toolCallId: event.toolCallId,
                  update: { result: event.result, status: 'completed' },
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
        turnResult.errorCount++;
        if (!isBackground) {
          dispatch({
            type: 'SET_ERROR',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
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
