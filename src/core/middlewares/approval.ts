import type { ToolMiddleware, ToolContext } from '../middleware.js';
import type { ApprovalCallback, ApprovalConfig, ApprovalMode } from '../types.js';

/**
 * Resolve the approval mode for a tool.
 * Config entries take priority; unspecified tools default to 'never'.
 */
export function resolveToolApproval(toolName: string, approvalConfig: ApprovalConfig): ApprovalMode {
  return approvalConfig.tools?.[toolName]?.approval ?? 'never';
}

/**
 * Creates a middleware that gates tool execution behind user approval.
 *
 * Handles all three modes:
 * - `always`      — every invocation requires approval
 * - `never`       — pass through
 * - `conditional` — uses a tool-specific check; falls back to `always` if none registered
 */
export function createApprovalMiddleware(
  approvalConfig: ApprovalConfig,
  onApprovalNeeded: ApprovalCallback,
  conditionalChecks: Record<string, (args: unknown) => boolean>,
): ToolMiddleware {
  return async (ctx: ToolContext, next) => {
    const mode = resolveToolApproval(ctx.toolName, approvalConfig);

    if (mode === 'never') {
      return next();
    }

    if (mode === 'always') {
      const approved = await onApprovalNeeded(ctx.toolName, ctx.toolCallId, ctx.args);
      if (!approved) {
        return { success: false, error: 'Command denied by user' };
      }
      return next();
    }

    // conditional
    const check = conditionalChecks[ctx.toolName];
    const needsApproval = check ? check(ctx.args) : true; // no check → always
    if (needsApproval) {
      const approved = await onApprovalNeeded(ctx.toolName, ctx.toolCallId, ctx.args);
      if (!approved) {
        return { success: false, error: 'Command denied by user' };
      }
    }
    return next();
  };
}
