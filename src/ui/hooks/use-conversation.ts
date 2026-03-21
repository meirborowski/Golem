import { useCallback, useRef, useEffect } from 'react';
import { useAppContext } from '../context/app-context.js';
import { ConversationEngine } from '../../core/conversation.js';
import { createBuiltinTools } from '../../core/tool-registry.js';
import type { ApprovalCallback, ChatMessage, TokenUsage, TurnResult, SendMessageOptions } from '../../core/types.js';
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
      const turnResult: TurnResult = { hadToolCalls: false, agentDoneCalled: false, hadTextOutput: false, errorCount: 0 };

      if (!engineRef.current || state.isStreaming) return turnResult;

      if (!options?.silent) {
        dispatch({ type: 'ADD_USER_MESSAGE', content: input });
      }
      dispatch({ type: 'START_STREAMING' });
      dispatch({ type: 'ADD_ASSISTANT_MESSAGE' });

      try {
        for await (const event of engineRef.current.sendMessage(input)) {
          switch (event.type) {
            case 'text-delta':
              turnResult.hadTextOutput = true;
              if (!options?.suppressText) {
                appendText(event.text);
              }
              break;

            case 'tool-call':
              // Flush any pending text before showing tool call
              flushTextBuffer();
              turnResult.hadToolCalls = true;
              if (event.toolName === 'agentDone') {
                turnResult.agentDoneCalled = true;
              }
              dispatch({
                type: 'ADD_TOOL_CALL',
                toolCall: {
                  id: event.toolCallId,
                  toolName: event.toolName,
                  args: event.args,
                  status: 'running',
                },
              });
              break;

            case 'tool-result':
              dispatch({
                type: 'UPDATE_TOOL_CALL',
                toolCallId: event.toolCallId,
                update: { result: event.result, status: 'completed' },
              });
              break;

            case 'finish':
              // Flush any remaining text before finishing
              flushTextBuffer();
              dispatch({ type: 'FINISH_STREAMING', usage: event.usage });
              break;

            case 'error':
              flushTextBuffer();
              turnResult.errorCount++;
              dispatch({ type: 'SET_ERROR', error: event.error.message });
              break;
          }
        }
      } catch (error) {
        flushTextBuffer();
        turnResult.errorCount++;
        dispatch({
          type: 'SET_ERROR',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

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
