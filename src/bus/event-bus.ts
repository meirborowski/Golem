/**
 * Golem Event Bus — Typed pub/sub for decoupled component communication.
 *
 * Events are dispatched to handlers in registration order. If a handler throws,
 * the error is caught and reported via `onError`, and remaining handlers still
 * execute. Interceptors run before handler dispatch (for logging/tracing only).
 */

import type { GolemEvent, GolemEventType, EventOfType } from './events.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type EventHandler<T extends GolemEvent = GolemEvent> = (event: T) => void | Promise<void>;

export type EventInterceptor = (
  event: GolemEvent,
  next: () => Promise<void>,
) => Promise<void>;

export type Unsubscribe = () => void;

export interface EventBus {
  /**
   * Subscribe to events of a specific type.
   * Returns an unsubscribe function.
   */
  on<T extends GolemEventType>(type: T, handler: EventHandler<EventOfType<T>>): Unsubscribe;

  /**
   * Emit an event. Dispatches to all registered handlers for the event type.
   * Handlers run sequentially in registration order.
   */
  emit(event: GolemEvent): Promise<void>;

  /**
   * Wait for the next event of a given type. Resolves on the first occurrence.
   */
  once<T extends GolemEventType>(type: T): Promise<EventOfType<T>>;

  /**
   * Wait for an event of a given type that matches the predicate.
   * Rejects if the timeout expires.
   */
  waitFor<T extends GolemEventType>(
    type: T,
    predicate: (event: EventOfType<T>) => boolean,
    timeoutMs?: number,
  ): Promise<EventOfType<T>>;

  /**
   * Add an interceptor that runs before handler dispatch.
   * Use for logging/debug tracing only — NOT for business logic.
   * Returns an unsubscribe function.
   */
  use(interceptor: EventInterceptor): Unsubscribe;

  /** Count of registered handlers, optionally filtered by event type. */
  listenerCount(type?: GolemEventType): number;

  /** Callback invoked when a handler throws. */
  onError?: (error: Error, event: GolemEvent) => void;
}

// ── Implementation ──────────────────────────────────────────────────────────

export class GolemEventBus implements EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private interceptors: EventInterceptor[] = [];
  onError?: (error: Error, event: GolemEvent) => void;

  on<T extends GolemEventType>(type: T, handler: EventHandler<EventOfType<T>>): Unsubscribe {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const castHandler = handler as EventHandler;
    set.add(castHandler);

    return () => {
      set!.delete(castHandler);
      if (set!.size === 0) {
        this.handlers.delete(type);
      }
    };
  }

  async emit(event: GolemEvent): Promise<void> {
    const dispatch = async (): Promise<void> => {
      const handlers = this.handlers.get(event.type);
      if (!handlers || handlers.size === 0) return;

      // Snapshot handlers to avoid mutation during iteration
      const snapshot = Array.from(handlers);
      for (const handler of snapshot) {
        try {
          await handler(event);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.onError?.(error, event);
        }
      }
    };

    if (this.interceptors.length === 0) {
      return dispatch();
    }

    // Build interceptor chain
    let idx = 0;
    const next = async (): Promise<void> => {
      if (idx < this.interceptors.length) {
        const interceptor = this.interceptors[idx++]!;
        await interceptor(event, next);
      } else {
        await dispatch();
      }
    };

    await next();
  }

  once<T extends GolemEventType>(type: T): Promise<EventOfType<T>> {
    return new Promise((resolve) => {
      const unsub = this.on(type, (event) => {
        unsub();
        resolve(event);
      });
    });
  }

  waitFor<T extends GolemEventType>(
    type: T,
    predicate: (event: EventOfType<T>) => boolean,
    timeoutMs = 30_000,
  ): Promise<EventOfType<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`waitFor('${type}') timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const unsub = this.on(type, (event) => {
        if (predicate(event)) {
          clearTimeout(timer);
          unsub();
          resolve(event);
        }
      });
    });
  }

  use(interceptor: EventInterceptor): Unsubscribe {
    this.interceptors.push(interceptor);
    return () => {
      const idx = this.interceptors.indexOf(interceptor);
      if (idx >= 0) this.interceptors.splice(idx, 1);
    };
  }

  listenerCount(type?: GolemEventType): number {
    if (type) return this.handlers.get(type)?.size ?? 0;
    let total = 0;
    this.handlers.forEach((set) => { total += set.size; });
    return total;
  }
}

/** Create a new EventBus instance. */
export function createEventBus(): GolemEventBus {
  return new GolemEventBus();
}
