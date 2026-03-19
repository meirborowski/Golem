import { readFile, writeFile, editFile, listFiles, searchFiles, bash } from '../tools/index.js';
import type { ResolvedConfig, ApprovalCallback } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolSet = Record<string, any>;

const TOOLS_REQUIRING_APPROVAL = new Set(['bash']);

function wrapWithApproval(
  originalTool: ToolSet[string],
  toolName: string,
  onApprovalNeeded: ApprovalCallback,
): ToolSet[string] {
  return {
    ...originalTool,
    execute: async (args: unknown, context: unknown) => {
      const ctx = context as { toolCallId?: string } | undefined;
      const toolCallId = ctx?.toolCallId ?? `${toolName}-${Date.now()}`;

      const approved = await onApprovalNeeded(toolName, toolCallId, args);
      if (!approved) {
        return { success: false, error: 'Command denied by user' };
      }

      return originalTool.execute(args, context);
    },
  };
}

export function createBuiltinTools(
  config: ResolvedConfig,
  onApprovalNeeded?: ApprovalCallback,
): ToolSet {
  const cwd = config.cwd;

  const allTools: ToolSet = {
    readFile: readFile(cwd),
    writeFile: writeFile(cwd),
    editFile: editFile(cwd),
    listFiles: listFiles(cwd),
    searchFiles: searchFiles(cwd),
    bash: bash(cwd),
  };

  if (onApprovalNeeded) {
    for (const name of TOOLS_REQUIRING_APPROVAL) {
      if (allTools[name]) {
        allTools[name] = wrapWithApproval(allTools[name], name, onApprovalNeeded);
      }
    }
  }

  return allTools;
}
