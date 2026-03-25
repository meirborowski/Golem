/**
 * ToolExecutor subscriber — Executes tools, checks approval, manages the live tool set.
 *
 * Listens: tool:call-requested, approval:resolved, tool:registered, tool:unregistered
 * Emits:   tool:call-started, tool:call-completed, approval:requested, agent:todos-updated
 */

import type { EventBus, Unsubscribe } from '../bus/event-bus.js';
import { createEvent } from '../bus/helpers.js';
import type { ApprovalConfig, ApprovalMode, ResolvedConfig } from '../core/types.js';
import { isGitReadOnly } from '../tools/index.js';
import { logger } from '../utils/logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolDefinition = any;

/** Resolve the approval mode for a tool from config. */
function resolveToolApproval(toolName: string, approvalConfig: ApprovalConfig): ApprovalMode {
  return approvalConfig.tools?.[toolName]?.approval ?? 'never';
}

/** Built-in conditional check functions. Returns true if the invocation needs approval. */
const CONDITIONAL_CHECKS: Record<string, (args: unknown) => boolean> = {
  git: (args: unknown) => {
    const { subcommand, args: gitArgs } = args as { subcommand: string; args: string | null };
    return !isGitReadOnly(subcommand, gitArgs);
  },
};

export class ToolExecutor {
  private tools = new Map<string, ToolDefinition>();
  private pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>();
  private disposers: Unsubscribe[] = [];

  constructor(
    private bus: EventBus,
    private config: ResolvedConfig,
  ) {
    this.disposers.push(
      bus.on('tool:call-requested', (e) => { void this.handleToolCall(e); }),
      bus.on('approval:resolved', (e) => {
        const pending = this.pendingApprovals.get(e.toolCallId);
        if (pending) {
          this.pendingApprovals.delete(e.toolCallId);
          pending.resolve(e.approved);
        }
      }),
      bus.on('tool:registered', (e) => {
        // The actual tool definition is registered via registerTool(), not from the event.
        // The event is just for notification. This is a no-op here.
      }),
      bus.on('tool:unregistered', (e) => {
        this.tools.delete(e.toolName);
      }),
    );
  }

  /** Register a tool definition (called by extensions and McpBridge). */
  registerTool(name: string, definition: ToolDefinition): void {
    this.tools.set(name, definition);
  }

  /** Unregister a tool. */
  unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  /** Get all registered tool definitions as a plain object (for streamText). */
  getToolSet(): Record<string, ToolDefinition> {
    const result: Record<string, ToolDefinition> = {};
    this.tools.forEach((def, name) => {
      result[name] = def;
    });
    return result;
  }

  /** Check if a tool is registered. */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  private async handleToolCall(event: import('../bus/events.js').ToolCallRequestedEvent): Promise<void> {
    const { toolCallId, toolName, args } = event;
    const tool = this.tools.get(toolName);

    if (!tool) {
      await this.bus.emit(createEvent('tool:call-completed', {
        toolCallId,
        toolName,
        result: { success: false, error: `Unknown tool: ${toolName}` },
        durationMs: 0,
        isError: true,
      }));
      return;
    }

    // Check approval
    const needsApproval = await this.checkApproval(toolName, args);
    if (needsApproval) {
      // Emit approval request and wait
      await this.bus.emit(createEvent('approval:requested', {
        toolCallId,
        toolName,
        args,
      }));

      const approved = await new Promise<boolean>((resolve) => {
        this.pendingApprovals.set(toolCallId, { resolve });
      });

      if (!approved) {
        await this.bus.emit(createEvent('tool:call-completed', {
          toolCallId,
          toolName,
          result: { success: false, error: 'Command denied by user' },
          durationMs: 0,
          isError: true,
        }));
        return;
      }
    }

    // Execute the tool
    await this.bus.emit(createEvent('tool:call-started', { toolCallId, toolName, args }));
    const startTime = Date.now();

    try {
      const result = await tool.execute(args, { toolCallId });
      const durationMs = Date.now() - startTime;

      // Check for todo updates in tool results
      if (toolName === 'todoManager' && result && typeof result === 'object' && 'todos' in result) {
        const todoResult = result as { todos?: import('../core/types.js').AgentTodoItem[] };
        if (todoResult.todos) {
          await this.bus.emit(createEvent('agent:todos-updated', { todos: todoResult.todos }));
        }
      }

      const isError = result && typeof result === 'object' && 'success' in result && !(result as { success: boolean }).success;

      await this.bus.emit(createEvent('tool:call-completed', {
        toolCallId,
        toolName,
        result,
        durationMs,
        isError: !!isError,
      }));
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Tool execution error', { toolName, error: errMsg });

      await this.bus.emit(createEvent('tool:call-completed', {
        toolCallId,
        toolName,
        result: { success: false, error: errMsg },
        durationMs,
        isError: true,
      }));
    }
  }

  private async checkApproval(toolName: string, args: unknown): Promise<boolean> {
    const mode = resolveToolApproval(toolName, this.config.approval);

    if (mode === 'never') return false;
    if (mode === 'always') return true;

    // conditional
    const check = CONDITIONAL_CHECKS[toolName];
    return check ? check(args) : true; // no check → always
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    // Reject any pending approvals
    this.pendingApprovals.forEach(({ resolve }) => resolve(false));
    this.pendingApprovals.clear();
  }
}
