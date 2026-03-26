import type { AgentContext } from "../entities/AgentContext.js";

export interface IDebugLogger {
  log(category: string, event: string, data?: Record<string, unknown>): void;
  isEnabled(): boolean;
}

export function snapshotContext(ctx: AgentContext): Record<string, unknown> {
  const lastMsg = ctx.messages[ctx.messages.length - 1];
  return {
    currentRequest: ctx.currentRequest,
    messageCount: ctx.messages.length,
    lastMessage: lastMsg
      ? {
          role: lastMsg.role,
          contentPreview:
            typeof lastMsg.content === "string"
              ? lastMsg.content.slice(0, 200)
              : "(non-string content)",
        }
      : null,
    gatheredFiles: Array.from(ctx.gatheredFiles.keys()),
    pendingChanges: ctx.pendingChanges.map((c) => ({
      path: c.filePath,
      op: c.operation,
    })),
    metadataKeys: Object.keys(ctx.metadata),
  };
}
