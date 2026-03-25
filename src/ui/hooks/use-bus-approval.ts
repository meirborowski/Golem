/**
 * useBusApproval — Non-blocking approval state from the bus.
 * No Promise callbacks leak into React.
 */

import { useState, useEffect, useCallback } from 'react';
import { useBus, useSubscribers } from '../context/bus-provider.js';
import { createEvent } from '../../bus/helpers.js';
import type { PendingApprovalInfo } from '../../subscribers/approval-gate.js';

export function useBusApproval() {
  const bus = useBus();
  const { approvalGate } = useSubscribers();
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalInfo | null>(null);

  useEffect(() => {
    const unsubs = [
      bus.on('approval:requested', (e) => {
        setPendingApproval({
          toolCallId: e.toolCallId,
          toolName: e.toolName,
          args: e.args,
          mcpServer: e.mcpServer,
        });
      }),
      bus.on('approval:resolved', () => {
        setPendingApproval(null);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [bus]);

  const approve = useCallback(() => {
    if (pendingApproval) {
      void bus.emit(createEvent('approval:resolved', {
        toolCallId: pendingApproval.toolCallId,
        approved: true,
      }));
    }
  }, [bus, pendingApproval]);

  const deny = useCallback(() => {
    if (pendingApproval) {
      void bus.emit(createEvent('approval:resolved', {
        toolCallId: pendingApproval.toolCallId,
        approved: false,
      }));
    }
  }, [bus, pendingApproval]);

  return { pendingApproval, approve, deny };
}
