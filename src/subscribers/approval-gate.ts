/**
 * ApprovalGate subscriber — Non-blocking approval state machine.
 *
 * The UI reads the current pending approval via getPendingApproval() and
 * resolves it by emitting approval:resolved directly on the bus.
 * No Promise callbacks leak into React.
 *
 * Listens: approval:requested
 * Emits:   (none — the UI emits approval:resolved)
 */

import type { EventBus, Unsubscribe } from '../bus/event-bus.js';

export interface PendingApprovalInfo {
  toolCallId: string;
  toolName: string;
  args: unknown;
  mcpServer?: string;
}

export class ApprovalGate {
  private pending: PendingApprovalInfo | null = null;
  private disposers: Unsubscribe[] = [];

  constructor(private bus: EventBus) {
    this.disposers.push(
      bus.on('approval:requested', (e) => {
        this.pending = {
          toolCallId: e.toolCallId,
          toolName: e.toolName,
          args: e.args,
          mcpServer: e.mcpServer,
        };
      }),
      bus.on('approval:resolved', (e) => {
        if (this.pending?.toolCallId === e.toolCallId) {
          this.pending = null;
        }
      }),
    );
  }

  /** Get the current pending approval, if any. */
  getPendingApproval(): PendingApprovalInfo | null {
    return this.pending;
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
  }
}
