import { useCallback, useRef } from 'react';
import { useAppContext } from '../context/app-context.js';
import { ConversationEngine } from '../../core/conversation.js';
import { createBuiltinTools } from '../../core/tool-registry.js';
import type { LanguageModel, ApprovalCallback } from '../../core/types.js';

export function useConversation(model: LanguageModel) {
  const { state, dispatch, config } = useAppContext();

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
    engineRef.current = new ConversationEngine(model, tools, config);
  }

  const sendMessage = useCallback(
    async (input: string) => {
      if (!engineRef.current || state.isStreaming) return;

      dispatch({ type: 'ADD_USER_MESSAGE', content: input });
      dispatch({ type: 'START_STREAMING' });
      dispatch({ type: 'ADD_ASSISTANT_MESSAGE' });

      try {
        for await (const event of engineRef.current.sendMessage(input)) {
          switch (event.type) {
            case 'text-delta':
              dispatch({ type: 'APPEND_CHUNK', text: event.text });
              break;

            case 'tool-call':
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
              dispatch({ type: 'FINISH_STREAMING', usage: event.usage });
              break;

            case 'error':
              dispatch({ type: 'SET_ERROR', error: event.error.message });
              break;
          }
        }
      } catch (error) {
        dispatch({
          type: 'SET_ERROR',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [state.isStreaming, dispatch, config],
  );

  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    error: state.error,
    tokenUsage: state.tokenUsage,
    sendMessage,
  };
}
