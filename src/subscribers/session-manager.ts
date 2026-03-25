/**
 * SessionManager subscriber — Save/load conversation sessions.
 *
 * Listens: (called directly by CommandHandler for /save, /load, /history)
 * Emits:   session:saved, session:loaded
 */

import type { EventBus, Unsubscribe } from '../bus/event-bus.js';
import { createEvent } from '../bus/helpers.js';
import type { ChatMessage, TokenUsage, ResolvedConfig } from '../core/types.js';
import {
  saveSession,
  loadSession,
  listSessions,
  getLatestSessionId,
  exportToMarkdown,
} from '../core/session.js';
import type { SessionSummary } from '../core/session.js';

export class SessionManager {
  private currentSessionId: string | null = null;
  private disposers: Unsubscribe[] = [];

  constructor(private bus: EventBus) {}

  /** Save the current conversation. Returns the session ID. */
  save(messages: ChatMessage[], tokenUsage: TokenUsage, config: ResolvedConfig): string {
    const session = saveSession(messages, tokenUsage, config, this.currentSessionId ?? undefined);
    this.currentSessionId = session.id;

    void this.bus.emit(createEvent('session:saved', { sessionId: session.id }));
    return session.id;
  }

  /** Load a session by ID (or latest if no ID). Returns null if not found. */
  load(id?: string): { messages: ChatMessage[]; tokenUsage: TokenUsage; sessionId: string } | null {
    const sessionId = id ?? getLatestSessionId();
    if (!sessionId) return null;

    const session = loadSession(sessionId);
    if (!session) return null;

    this.currentSessionId = session.id;

    void this.bus.emit(createEvent('session:loaded', {
      sessionId: session.id,
      messages: session.messages,
      tokenUsage: session.tokenUsage,
    }));

    return {
      messages: session.messages,
      tokenUsage: session.tokenUsage,
      sessionId: session.id,
    };
  }

  /** List recent sessions. */
  list(limit = 20): SessionSummary[] {
    return listSessions(limit);
  }

  /** Export messages to markdown format. */
  export(messages: ChatMessage[], provider: string, model: string): string {
    return exportToMarkdown(messages, provider, model);
  }

  /** Get the current session ID. */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /** Set the current session ID (e.g., after loading). */
  setCurrentSessionId(id: string | null): void {
    this.currentSessionId = id;
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
  }
}
