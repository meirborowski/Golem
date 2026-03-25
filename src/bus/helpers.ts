/**
 * Golem Event Bus — Helper utilities for creating events and type guards.
 */

import { randomUUID } from 'node:crypto';
import type { GolemEvent, GolemEventType, EventOfType, EventBase } from './events.js';

/**
 * Create an event with auto-generated id and timestamp.
 * Pass the event type and payload fields (excluding id/timestamp).
 *
 * @example
 * ```ts
 * const event = createEvent('stream:text-delta', { requestId: '123', text: 'hello' });
 * ```
 */
export function createEvent<T extends GolemEventType>(
  type: T,
  payload: Omit<EventOfType<T>, keyof EventBase | 'type'>,
): EventOfType<T> {
  return {
    id: randomUUID(),
    timestamp: Date.now(),
    type,
    ...payload,
  } as EventOfType<T>;
}

/** Type guard: check if an event is of a specific type. */
export function isEventType<T extends GolemEventType>(
  event: GolemEvent,
  type: T,
): event is EventOfType<T> {
  return event.type === type;
}

/** Extract the domain prefix from an event type (e.g., 'stream' from 'stream:text-delta'). */
export function eventDomain(type: GolemEventType): string {
  return type.split(':')[0]!;
}
