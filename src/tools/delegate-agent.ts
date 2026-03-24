import { tool } from 'ai';
import { z } from 'zod';
import { loadAgent } from '../agents/agent-loader.js';
import { runAgent } from '../agents/agent-runner.js';
import { ConversationEngine } from '../core/conversation.js';
import { createBuiltinTools, getToolMeta } from '../core/tool-registry.js';
import { summarizeToolResult, isToolError } from '../core/stream-utils.js';
import type { ChainContext, AgentCallbacks } from '../agents/agent-types.js';
import type { ResolvedConfig, ApprovalCallback, TurnResult, ToolCallInfo, LanguageModel } from '../core/types.js';
import type { ExtensionRegistry } from '../core/extension-registry.js';

/**
 * Collect stream events from a ConversationEngine into a TurnResult.
 * This is the React-free equivalent of use-conversation.ts background mode.
 */
async function collectStreamResults(
  engine: ConversationEngine,
  input: string,
): Promise<TurnResult> {
  const turnResult: TurnResult = {
    hadToolCalls: false,
    agentDoneCalled: false,
    hadTextOutput: false,
    errorCount: 0,
    finalText: '',
    toolCalls: [],
    lastError: '',
  };

  let collectedText = '';
  const collectedToolCalls: ToolCallInfo[] = [];
  const toolStartTimes = new Map<string, number>();

  try {
    for await (const event of engine.sendMessage(input)) {
      switch (event.type) {
        case 'text-delta':
          turnResult.hadTextOutput = true;
          collectedText += event.text;
          break;

        case 'tool-call': {
          turnResult.hadToolCalls = true;
          if (event.toolName === 'agentDone') {
            turnResult.agentDoneCalled = true;
          }
          const now = Date.now();
          toolStartTimes.set(event.toolCallId, now);
          collectedToolCalls.push({
            id: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
            status: 'running' as const,
            startedAt: now,
          });
          break;
        }

        case 'tool-result': {
          const toolError = isToolError(event.result);
          const toolStatus = toolError ? ('error' as const) : ('completed' as const);
          const startTime = toolStartTimes.get(event.toolCallId);
          const durationMs = startTime != null ? Date.now() - startTime : undefined;
          toolStartTimes.delete(event.toolCallId);

          const tc = collectedToolCalls.find((t) => t.id === event.toolCallId);
          if (tc) {
            tc.result = summarizeToolResult(event.result);
            tc.status = toolStatus;
            tc.durationMs = durationMs;
          }
          break;
        }

        case 'error':
          turnResult.errorCount++;
          turnResult.lastError = event.error.message;
          break;

        case 'finish':
          break;
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    turnResult.errorCount++;
    turnResult.lastError = errMsg;
  }

  turnResult.finalText = collectedText;
  turnResult.toolCalls = collectedToolCalls;
  return turnResult;
}

export interface DelegateAgentDeps {
  cwd: string;
  config: ResolvedConfig;
  registry: ExtensionRegistry;
  model: LanguageModel;
  approvalCallback: ApprovalCallback | undefined;
  chainContext: ChainContext;
  isCancelled: () => boolean;
}

export const createDelegateAgent = (deps: DelegateAgentDeps) =>
  Object.assign(
    tool({
      description:
        'Delegate a task to another agent. The sub-agent runs with its own conversation and returns a summary when done. Use this to leverage specialized agents for specific sub-tasks.',
      inputSchema: z.object({
        agentName: z.string().describe('Name of the agent to delegate to (e.g. "code-review", "test-runner")'),
        task: z.string().describe('The task to assign to the sub-agent'),
        context: z.union([z.string(), z.null()]).describe('Optional context from prior work to pass to the sub-agent. Null if none.'),
      }),
      execute: async ({ agentName, task, context }) => {
      const { cwd, config, registry, model, approvalCallback, chainContext, isCancelled } = deps;

      // Check depth limit
      if (chainContext.depth >= chainContext.maxDepth) {
        return {
          success: false,
          error: `Max agent chain depth (${chainContext.maxDepth}) exceeded. Cannot delegate to "${agentName}".`,
        };
      }

      // Check for cycles
      if (chainContext.activeAgents.has(agentName)) {
        return {
          success: false,
          error: `Cycle detected: agent "${agentName}" is already active in the chain [${[...chainContext.activeAgents].join(' → ')}]. Cannot delegate recursively.`,
        };
      }

      // Load the target agent config
      const subAgent = loadAgent(agentName, cwd);
      if (!subAgent) {
        return {
          success: false,
          error: `Agent "${agentName}" not found. Available agents are loaded from .golem/agents/, ~/.config/golem/agents/, or built-in configs.`,
        };
      }

      // Create tools for the sub-agent
      const subChainContext: ChainContext = {
        depth: chainContext.depth + 1,
        maxDepth: chainContext.maxDepth,
        activeAgents: new Set([...chainContext.activeAgents, agentName]),
        onSubAgentStart: chainContext.onSubAgentStart,
        onSubAgentComplete: chainContext.onSubAgentComplete,
      };

      const subTools = createBuiltinTools(config, registry, approvalCallback, subAgent.tools);

      // If the sub-agent has delegateAgent in its tools, create a nested one
      if (subAgent.tools.includes('delegateAgent')) {
        const nestedDelegate = createDelegateAgent({
          ...deps,
          chainContext: subChainContext,
        });
        subTools['delegateAgent'] = nestedDelegate;
      }

      // Populate tool metadata
      subAgent.toolMeta = getToolMeta(subTools);

      // Create an isolated ConversationEngine for the sub-agent
      const subEngine = new ConversationEngine(model, subTools, config, subAgent);
      subEngine.setRegistry(registry);

      // Build the sub-agent input
      let combinedInput = task;
      if (context) {
        combinedInput = `[Context from parent agent]\n${context}\n\n[Task]\n${task}`;
      }

      // Notify UI
      chainContext.onSubAgentStart?.(agentName, chainContext.depth + 1);

      // Build callbacks for the sub-agent
      const subCallbacks: AgentCallbacks = {
        sendMessage: async (input, _opts) => collectStreamResults(subEngine, input),
        onTurnComplete: () => {}, // Sub-agent turns are not tracked in parent UI
        isCancelled,
      };

      try {
        const result = await runAgent(combinedInput, subAgent, subCallbacks);

        chainContext.onSubAgentComplete?.(agentName, chainContext.depth + 1, result);

        if (result.status === 'error') {
          return {
            success: false,
            error: `Sub-agent "${agentName}" failed: ${result.lastError || result.finalText}`,
            agentName,
            status: result.status,
            turnsUsed: result.turnsUsed,
          };
        }

        return {
          success: true,
          agentName,
          status: result.status,
          summary: result.finalText,
          turnsUsed: result.turnsUsed,
          toolCallCount: result.allToolCalls.length,
        };
      } catch (error) {
        chainContext.onSubAgentComplete?.(agentName, chainContext.depth + 1, {
          status: 'error',
          finalText: '',
          allToolCalls: [],
          lastError: error instanceof Error ? error.message : String(error),
          turnsUsed: 0,
        });

        return {
          success: false,
          error: `Sub-agent "${agentName}" threw an unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  }),
  { whenToUse: 'When a task has a distinct sub-task that would benefit from a specialized agent (e.g. code-review, test-runner). Do not delegate trivially — only when a different agent\'s specialization adds value.' },
);
