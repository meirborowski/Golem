/**
 * HistoryManager subscriber — Owns message history and context window truncation.
 *
 * Listens: history:message-added, stream:requested (triggers truncation), history:cleared, session:loaded
 * Emits:   history:truncated
 */

import type { EventBus, Unsubscribe } from '../bus/event-bus.js';
import { createEvent } from '../bus/helpers.js';
import type { ModelMessage, TokenUsage, ResolvedConfig } from '../core/types.js';
import { logger } from '../utils/logger.js';

export class HistoryManager {
  private messages: ModelMessage[] = [];
  private totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private disposers: Unsubscribe[] = [];

  constructor(
    private bus: EventBus,
    private config: ResolvedConfig,
  ) {
    this.disposers.push(
      bus.on('history:cleared', () => {
        this.messages = [];
        this.totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      }),
      bus.on('session:loaded', (e) => {
        // Session messages are ChatMessage[], but we need ModelMessage[].
        // The StreamCoordinator will handle conversion; here we just clear for fresh state.
        this.messages = [];
        this.totalUsage = { ...e.tokenUsage };
      }),
    );
  }

  /** Get the current message history (read-only snapshot). */
  getMessages(): ModelMessage[] {
    return [...this.messages];
  }

  /** Get a mutable reference to messages (for StreamCoordinator to pass to streamText). */
  getMessagesRef(): ModelMessage[] {
    return this.messages;
  }

  /** Add a user message to history. */
  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  /** Append response messages from the AI SDK. */
  addResponseMessages(messages: ModelMessage[]): void {
    this.messages.push(...messages);
  }

  /** Load messages directly (e.g., from session restore). */
  loadMessages(messages: ModelMessage[], usage?: TokenUsage): void {
    this.messages = [...messages];
    if (usage) {
      this.totalUsage = { ...usage };
    }
  }

  /** Accumulate token usage from a stream finish event. */
  addUsage(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }): void {
    this.totalUsage.promptTokens += usage.inputTokens ?? 0;
    this.totalUsage.completionTokens += usage.outputTokens ?? 0;
    this.totalUsage.totalTokens += usage.totalTokens ?? 0;
  }

  /** Get the current token usage. */
  getTokenUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  /** Clear all history and usage. */
  clear(): void {
    this.messages = [];
    this.totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  /**
   * Truncate old messages to fit within the context window.
   * Returns number of messages dropped.
   */
  truncate(systemPromptLength: number): number {
    const contextWindow = this.config.contextWindow;
    const systemPromptTokens = this.estimateTokens(systemPromptLength);
    const reservedTokens = systemPromptTokens + this.config.maxTokens + 200;
    const availableTokens = contextWindow - reservedTokens;

    if (availableTokens <= 0) return 0;

    let totalTokens = 0;
    for (const msg of this.messages) {
      totalTokens += this.estimateMessageTokens(msg);
    }

    if (totalTokens <= availableTokens) return 0;

    const minKeep = 2;
    let dropped = 0;

    while (this.messages.length > minKeep && totalTokens > availableTokens) {
      const removed = this.messages.shift();
      if (removed) {
        totalTokens -= this.estimateMessageTokens(removed);
        dropped++;
      }
    }

    if (dropped > 0) {
      this.messages.unshift({
        role: 'user',
        content: `[System note: ${dropped} earlier messages were truncated to fit the context window. The conversation continues from here.]`,
      });

      logger.info(`Truncated ${dropped} old messages to fit context window`);
      void this.bus.emit(createEvent('history:truncated', { droppedCount: dropped }));
    }

    return dropped;
  }

  private estimateTokens(charCount: number): number {
    return Math.ceil(charCount / 4);
  }

  private estimateMessageTokens(msg: ModelMessage): number {
    if (typeof msg.content === 'string') {
      return this.estimateTokens(msg.content.length) + 4;
    }
    return this.estimateTokens(JSON.stringify(msg.content).length) + 4;
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
  }
}
