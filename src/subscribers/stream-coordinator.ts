/**
 * StreamCoordinator subscriber — Manages streamText calls from the Vercel AI SDK.
 *
 * Listens: stream:requested, config:provider-switched
 * Emits:   stream:started, stream:text-delta, tool:call-requested, stream:finished,
 *          stream:error, history:message-added
 */

import { streamText, tool, stepCountIs } from 'ai';
import type { LanguageModel } from 'ai';
import type { EventBus, Unsubscribe } from '../bus/event-bus.js';
import { createEvent } from '../bus/helpers.js';
import type { ToolCallInfo, ResolvedConfig } from '../core/types.js';
import type { HistoryManager } from './history-manager.js';
import type { PromptBuilder } from './prompt-builder.js';
import type { ToolExecutor } from './tool-executor.js';
import type { ConfigManager } from './config-manager.js';
import { logger } from '../utils/logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolSet = Record<string, any>;

export class StreamCoordinator {
  private model: LanguageModel;
  private disposers: Unsubscribe[] = [];

  constructor(
    private bus: EventBus,
    private configManager: ConfigManager,
    private historyManager: HistoryManager,
    private promptBuilder: PromptBuilder,
    private toolExecutor: ToolExecutor,
  ) {
    this.model = configManager.resolveModel();

    this.disposers.push(
      bus.on('stream:requested', (e) => { void this.handleStreamRequest(e); }),
      bus.on('config:provider-switched', (e) => {
        this.model = this.configManager.resolveModel(e.provider, e.model);
      }),
    );
  }

  /** Update the model (e.g., after provider switch). */
  setModel(model: LanguageModel): void {
    this.model = model;
  }

  private async handleStreamRequest(
    event: import('../bus/events.js').StreamRequestedEvent,
  ): Promise<void> {
    const requestId = event.id;
    const { userMessage, options } = event;

    // Add user message to history
    if (!options.silent) {
      await this.bus.emit(createEvent('history:message-added', {
        message: {
          role: 'user',
          content: userMessage,
          timestamp: Date.now(),
        },
      }));
    }
    this.historyManager.addUserMessage(userMessage);

    // Truncate if needed
    const systemPrompt = this.promptBuilder.getSystemPrompt();
    this.historyManager.truncate(systemPrompt.length);

    await this.bus.emit(createEvent('stream:started', { requestId }));

    const messages = this.historyManager.getMessagesRef();
    const toolSet = this.buildWrappedToolSet();

    let fullText = '';
    const toolCalls: ToolCallInfo[] = [];

    try {
      const config = this.configManager.getConfig();
      const streamOptions: Parameters<typeof streamText>[0] = {
        model: this.model,
        system: systemPrompt,
        messages,
        tools: toolSet,
        stopWhen: stepCountIs(50),
        maxOutputTokens: config.maxTokens,
      };
      if (config.temperature !== undefined) {
        streamOptions.temperature = config.temperature;
      }

      const result = streamText(streamOptions);

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            fullText += part.text;
            if (!options.suppressText && !options.background) {
              await this.bus.emit(createEvent('stream:text-delta', {
                requestId,
                text: part.text,
              }));
            }
            break;

          case 'tool-call':
            logger.debug('Tool call', { tool: part.toolName, input: part.input });
            toolCalls.push({
              id: part.toolCallId,
              toolName: part.toolName,
              args: part.input,
              status: 'pending',
            });
            // Tool execution happens inside the SDK's execute function (wrapped below)
            break;

          case 'tool-result':
            logger.debug('Tool result', { tool: part.toolName });
            // Update tool call status
            const tc = toolCalls.find((t) => t.id === part.toolCallId);
            if (tc) {
              tc.result = part.output;
              tc.status = 'completed';
            }
            break;

          case 'finish':
            if (part.totalUsage) {
              this.historyManager.addUsage({
                inputTokens: part.totalUsage.inputTokens,
                outputTokens: part.totalUsage.outputTokens,
                totalTokens: part.totalUsage.totalTokens,
              });
            }
            break;

          case 'error': {
            const errMsg =
              part.error instanceof Error
                ? part.error.message
                : typeof part.error === 'string'
                  ? part.error
                  : JSON.stringify(part.error);

            await this.bus.emit(createEvent('stream:error', {
              requestId,
              error: errMsg,
            }));
            break;
          }
        }
      }

      // Add response messages to history
      const response = await result.response;
      this.historyManager.addResponseMessages(response.messages);

      // Emit assistant message to UI
      if (!options.background) {
        await this.bus.emit(createEvent('history:message-added', {
          message: {
            role: 'assistant',
            content: fullText,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            timestamp: Date.now(),
          },
        }));
      }

      await this.bus.emit(createEvent('stream:finished', {
        requestId,
        usage: this.historyManager.getTokenUsage(),
        fullText,
        toolCalls,
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Stream error', { error: err.message });
      await this.bus.emit(createEvent('stream:error', {
        requestId,
        error: err.message,
      }));
    }
  }

  /**
   * Build a tool set where each tool's execute function routes through the bus.
   * When the AI SDK calls execute(), we emit tool:call-requested and wait for
   * tool:call-completed, allowing the ToolExecutor to handle approval and execution.
   */
  private buildWrappedToolSet(): ToolSet {
    const rawTools = this.toolExecutor.getToolSet();
    const wrappedTools: ToolSet = {};

    for (const [name, toolDef] of Object.entries(rawTools)) {
      wrappedTools[name] = {
        ...toolDef,
        execute: async (args: unknown, context: { toolCallId: string }) => {
          const toolCallId = context.toolCallId;

          // Emit tool:call-requested and wait for tool:call-completed
          await this.bus.emit(createEvent('tool:call-requested', {
            requestId: '', // Will be set by the current stream context
            toolCallId,
            toolName: name,
            args,
          }));

          // Wait for the ToolExecutor to complete
          const completedEvent = await this.bus.waitFor(
            'tool:call-completed',
            (e) => e.toolCallId === toolCallId,
            300_000, // 5 minute timeout for tool execution
          );

          return completedEvent.result;
        },
      };
    }

    return wrappedTools;
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
  }
}
