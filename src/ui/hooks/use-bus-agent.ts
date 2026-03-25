/**
 * useBusAgent — Agent mode state from bus events.
 */

import { useState, useEffect } from 'react';
import { useBus } from '../context/bus-provider.js';
import type { AgentModeState, AgentToolActivity } from '../../core/types.js';

export function useBusAgent() {
  const bus = useBus();
  const [agentMode, setAgentMode] = useState<AgentModeState | null>(null);

  useEffect(() => {
    const unsubs = [
      bus.on('agent:started', (e) => {
        setAgentMode({
          task: e.task,
          currentTurn: 0,
          maxTurns: e.maxTurns,
          status: 'running',
          toolActivity: [],
          totalToolsExecuted: 0,
          todos: [],
          chainStack: [],
        });
      }),

      bus.on('agent:turn-completed', (e) => {
        setAgentMode((prev) =>
          prev ? { ...prev, currentTurn: e.turn, toolActivity: [] } : null,
        );
      }),

      bus.on('agent:finished', (e) => {
        setAgentMode((prev) =>
          prev ? { ...prev, status: e.status } : null,
        );
      }),

      bus.on('agent:chain-push', (e) => {
        setAgentMode((prev) =>
          prev ? { ...prev, chainStack: [...prev.chainStack, e.agentName] } : null,
        );
      }),

      bus.on('agent:chain-pop', () => {
        setAgentMode((prev) =>
          prev ? { ...prev, chainStack: prev.chainStack.slice(0, -1) } : null,
        );
      }),

      bus.on('agent:todos-updated', (e) => {
        setAgentMode((prev) =>
          prev ? { ...prev, todos: e.todos } : null,
        );
      }),

      bus.on('tool:call-started', (e) => {
        setAgentMode((prev) => {
          if (!prev) return null;
          const argsPreview = typeof e.args === 'string'
            ? e.args.slice(0, 80)
            : JSON.stringify(e.args).slice(0, 80);
          return {
            ...prev,
            toolActivity: [
              ...prev.toolActivity,
              { toolName: e.toolName, argsPreview, status: 'running' as const },
            ],
          };
        });
      }),

      bus.on('tool:call-completed', (e) => {
        setAgentMode((prev) => {
          if (!prev) return null;
          const toolActivity = [...prev.toolActivity];
          for (let i = toolActivity.length - 1; i >= 0; i--) {
            if (toolActivity[i]!.toolName === e.toolName && toolActivity[i]!.status === 'running') {
              toolActivity[i] = {
                ...toolActivity[i]!,
                status: e.isError ? 'error' : 'completed',
                durationMs: e.durationMs,
              };
              break;
            }
          }
          return {
            ...prev,
            toolActivity,
            totalToolsExecuted: prev.totalToolsExecuted + 1,
          };
        });
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [bus]);

  return agentMode;
}
