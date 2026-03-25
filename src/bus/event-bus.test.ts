import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GolemEventBus, createEventBus } from './event-bus.js';
import { createEvent } from './helpers.js';
import type { GolemEvent } from './events.js';

describe('GolemEventBus', () => {
  let bus: GolemEventBus;

  beforeEach(() => {
    bus = createEventBus();
  });

  // ── Core pub/sub ────────────────────────────────────────────────────────

  describe('on / emit', () => {
    it('dispatches events to matching handlers', async () => {
      const handler = vi.fn();
      bus.on('ui:ready', handler);

      const event = createEvent('ui:ready', {});
      await bus.emit(event);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('does not dispatch to handlers of other types', async () => {
      const handler = vi.fn();
      bus.on('ui:ready', handler);

      await bus.emit(createEvent('history:cleared', {}));

      expect(handler).not.toHaveBeenCalled();
    });

    it('dispatches to multiple handlers in registration order', async () => {
      const order: number[] = [];
      bus.on('ui:ready', () => { order.push(1); });
      bus.on('ui:ready', () => { order.push(2); });
      bus.on('ui:ready', () => { order.push(3); });

      await bus.emit(createEvent('ui:ready', {}));

      expect(order).toEqual([1, 2, 3]);
    });

    it('handles async handlers sequentially', async () => {
      const order: number[] = [];
      bus.on('ui:ready', async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      });
      bus.on('ui:ready', () => { order.push(2); });

      await bus.emit(createEvent('ui:ready', {}));

      expect(order).toEqual([1, 2]);
    });

    it('returns unsubscribe function', async () => {
      const handler = vi.fn();
      const unsub = bus.on('ui:ready', handler);

      unsub();
      await bus.emit(createEvent('ui:ready', {}));

      expect(handler).not.toHaveBeenCalled();
    });

    it('does nothing when emitting with no handlers', async () => {
      // Should not throw
      await bus.emit(createEvent('ui:ready', {}));
    });

    it('handles handler added during iteration (snapshot behavior)', async () => {
      const lateHandler = vi.fn();
      bus.on('ui:ready', () => {
        bus.on('ui:ready', lateHandler);
      });

      await bus.emit(createEvent('ui:ready', {}));

      // Handler added during iteration should NOT be called for this emit
      expect(lateHandler).not.toHaveBeenCalled();
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches handler errors and continues to remaining handlers', async () => {
      const errorHandler = vi.fn();
      bus.onError = errorHandler;

      const handler1 = vi.fn(() => { throw new Error('boom'); });
      const handler2 = vi.fn();

      bus.on('ui:ready', handler1);
      bus.on('ui:ready', handler2);

      await bus.emit(createEvent('ui:ready', {}));

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
      expect(errorHandler).toHaveBeenCalledOnce();
      expect(errorHandler.mock.calls[0]![0]).toBeInstanceOf(Error);
      expect(errorHandler.mock.calls[0]![0]!.message).toBe('boom');
    });

    it('wraps non-Error throws in Error', async () => {
      const errorHandler = vi.fn();
      bus.onError = errorHandler;

      bus.on('ui:ready', () => { throw 'string error'; });

      await bus.emit(createEvent('ui:ready', {}));

      expect(errorHandler.mock.calls[0]![0]).toBeInstanceOf(Error);
      expect(errorHandler.mock.calls[0]![0]!.message).toBe('string error');
    });

    it('does not crash if onError is not set', async () => {
      bus.on('ui:ready', () => { throw new Error('no handler'); });

      // Should not throw
      await bus.emit(createEvent('ui:ready', {}));
    });
  });

  // ── once ────────────────────────────────────────────────────────────────

  describe('once', () => {
    it('resolves on the next matching event', async () => {
      const promise = bus.once('ui:ready');

      const event = createEvent('ui:ready', {});
      await bus.emit(event);

      const result = await promise;
      expect(result).toBe(event);
    });

    it('only fires once', async () => {
      const promise = bus.once('ui:ready');
      await bus.emit(createEvent('ui:ready', {}));
      await promise;

      // After once resolves, the handler is unsubscribed
      expect(bus.listenerCount('ui:ready')).toBe(0);
    });
  });

  // ── waitFor ─────────────────────────────────────────────────────────────

  describe('waitFor', () => {
    it('resolves when predicate matches', async () => {
      const promise = bus.waitFor(
        'stream:text-delta',
        (e) => e.requestId === 'abc',
      );

      // Emit non-matching first
      await bus.emit(createEvent('stream:text-delta', {
        requestId: 'other',
        text: 'hello',
      }));

      // Emit matching
      const matchEvent = createEvent('stream:text-delta', {
        requestId: 'abc',
        text: 'world',
      });
      await bus.emit(matchEvent);

      const result = await promise;
      expect(result).toBe(matchEvent);
    });

    it('rejects on timeout', async () => {
      const promise = bus.waitFor(
        'ui:ready',
        () => true,
        50, // 50ms timeout
      );

      await expect(promise).rejects.toThrow("waitFor('ui:ready') timed out after 50ms");
    });

    it('unsubscribes after matching', async () => {
      const promise = bus.waitFor(
        'ui:ready',
        () => true,
      );

      await bus.emit(createEvent('ui:ready', {}));
      await promise;

      expect(bus.listenerCount('ui:ready')).toBe(0);
    });

    it('unsubscribes on timeout', async () => {
      const promise = bus.waitFor('ui:ready', () => true, 10);

      try { await promise; } catch { /* expected */ }

      expect(bus.listenerCount('ui:ready')).toBe(0);
    });
  });

  // ── Interceptors ────────────────────────────────────────────────────────

  describe('interceptors', () => {
    it('runs interceptors before handlers', async () => {
      const order: string[] = [];

      bus.use(async (_event, next) => {
        order.push('interceptor-before');
        await next();
        order.push('interceptor-after');
      });

      bus.on('ui:ready', () => { order.push('handler'); });

      await bus.emit(createEvent('ui:ready', {}));

      expect(order).toEqual(['interceptor-before', 'handler', 'interceptor-after']);
    });

    it('chains multiple interceptors', async () => {
      const order: string[] = [];

      bus.use(async (_event, next) => {
        order.push('i1-before');
        await next();
        order.push('i1-after');
      });

      bus.use(async (_event, next) => {
        order.push('i2-before');
        await next();
        order.push('i2-after');
      });

      bus.on('ui:ready', () => { order.push('handler'); });

      await bus.emit(createEvent('ui:ready', {}));

      expect(order).toEqual(['i1-before', 'i2-before', 'handler', 'i2-after', 'i1-after']);
    });

    it('can short-circuit by not calling next()', async () => {
      const handler = vi.fn();

      bus.use(async () => {
        // Intentionally not calling next()
      });

      bus.on('ui:ready', handler);

      await bus.emit(createEvent('ui:ready', {}));

      expect(handler).not.toHaveBeenCalled();
    });

    it('can be removed via unsubscribe', async () => {
      const interceptorFn = vi.fn(async (_event: GolemEvent, next: () => Promise<void>) => {
        await next();
      });

      const unsub = bus.use(interceptorFn);
      unsub();

      const handler = vi.fn();
      bus.on('ui:ready', handler);

      await bus.emit(createEvent('ui:ready', {}));

      expect(interceptorFn).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // ── listenerCount ───────────────────────────────────────────────────────

  describe('listenerCount', () => {
    it('returns 0 for no listeners', () => {
      expect(bus.listenerCount('ui:ready')).toBe(0);
      expect(bus.listenerCount()).toBe(0);
    });

    it('returns count for specific type', () => {
      bus.on('ui:ready', () => {});
      bus.on('ui:ready', () => {});
      bus.on('history:cleared', () => {});

      expect(bus.listenerCount('ui:ready')).toBe(2);
      expect(bus.listenerCount('history:cleared')).toBe(1);
    });

    it('returns total count without type filter', () => {
      bus.on('ui:ready', () => {});
      bus.on('ui:ready', () => {});
      bus.on('history:cleared', () => {});

      expect(bus.listenerCount()).toBe(3);
    });

    it('decrements on unsubscribe', () => {
      const unsub1 = bus.on('ui:ready', () => {});
      bus.on('ui:ready', () => {});

      expect(bus.listenerCount('ui:ready')).toBe(2);

      unsub1();
      expect(bus.listenerCount('ui:ready')).toBe(1);
    });

    it('cleans up empty handler sets on unsubscribe', () => {
      const unsub = bus.on('ui:ready', () => {});
      unsub();

      expect(bus.listenerCount('ui:ready')).toBe(0);
    });
  });

  // ── createEventBus factory ──────────────────────────────────────────────

  describe('createEventBus', () => {
    it('returns a GolemEventBus instance', () => {
      const bus = createEventBus();
      expect(bus).toBeInstanceOf(GolemEventBus);
    });
  });
});
