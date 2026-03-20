import { readFile, writeFile, editFile, listFiles, searchFiles, bash, git, isGitReadOnly, think, fetchUrl, patch, todoManager, memory, multiEdit, codeOutline } from '../tools/index.js';
import type { ResolvedConfig, ApprovalCallback } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolSet = Record<string, any>;

/** Tools that always require approval for every invocation. */
const TOOLS_REQUIRING_APPROVAL = new Set(['bash']);

/**
 * Tools that require approval only for certain arguments.
 * Each entry maps a tool name to a function that returns true if approval is needed.
 */
const CONDITIONAL_APPROVAL: Record<string, (args: unknown) => boolean> = {
  git: (args: unknown) => {
    const { subcommand, args: gitArgs } = args as { subcommand: string; args: string | null };
    return !isGitReadOnly(subcommand, gitArgs);
  },
};

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

function wrapWithConditionalApproval(
  originalTool: ToolSet[string],
  toolName: string,
  needsApproval: (args: unknown) => boolean,
  onApprovalNeeded: ApprovalCallback,
): ToolSet[string] {
  return {
    ...originalTool,
    execute: async (args: unknown, context: unknown) => {
      if (needsApproval(args)) {
        const ctx = context as { toolCallId?: string } | undefined;
        const toolCallId = ctx?.toolCallId ?? `${toolName}-${Date.now()}`;

        const approved = await onApprovalNeeded(toolName, toolCallId, args);
        if (!approved) {
          return { success: false, error: 'Command denied by user' };
        }
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
    git: git(cwd),
    think: think(),
    fetchUrl: fetchUrl(),
    patch: patch(cwd),
    todoManager: todoManager(cwd),
    memory: memory(cwd),
    multiEdit: multiEdit(cwd),
    codeOutline: codeOutline(cwd),
  };

  if (onApprovalNeeded) {
    for (const name of TOOLS_REQUIRING_APPROVAL) {
      if (allTools[name]) {
        allTools[name] = wrapWithApproval(allTools[name], name, onApprovalNeeded);
      }
    }

    for (const [name, check] of Object.entries(CONDITIONAL_APPROVAL)) {
      if (allTools[name]) {
        allTools[name] = wrapWithConditionalApproval(allTools[name], name, check, onApprovalNeeded);
      }
    }
  }

  return allTools;
}
