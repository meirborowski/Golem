import { z } from 'zod';
import { readFile, writeFile, editFile, listFiles, searchFiles, bash, git, isGitReadOnly, think, fetchUrl, patch, todoManager, memory, multiEdit, codeOutline, rename, directoryTree, webSearch, diffFiles } from '../tools/index.js';
import type { ResolvedConfig, ApprovalCallback } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolSet = Record<string, any>;

/**
 * Wrap a tool's parameters schema so that missing nullable properties
 * default to null before Zod validation. This keeps all properties in the
 * JSON schema's `required` array (satisfying OpenAI) while still handling
 * providers like Gemini that omit optional parameters entirely.
 */
function normalizeNullableParams(toolDef: ToolSet[string]): ToolSet[string] {
  const schema = toolDef.inputSchema;
  if (!(schema instanceof z.ZodObject)) return toolDef;

  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const nullableKeys: string[] = [];

  for (const [key, fieldSchema] of Object.entries(shape)) {
    // Detect z.union([..., z.null()]) patterns
    if (fieldSchema instanceof z.ZodUnion) {
      const options = (fieldSchema as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>).options;
      if (options.some((opt: z.ZodTypeAny) => opt instanceof z.ZodNull)) {
        nullableKeys.push(key);
      }
    }
  }

  if (nullableKeys.length === 0) return toolDef;

  const wrapped = z.preprocess((val: unknown) => {
    if (val && typeof val === 'object') {
      const obj = { ...(val as Record<string, unknown>) };
      for (const key of nullableKeys) {
        if (!(key in obj) || obj[key] === undefined) {
          obj[key] = null;
        }
      }
      return obj;
    }
    return val;
  }, schema);

  return { ...toolDef, inputSchema: wrapped };
}

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
  const searxngBaseUrl =
    config.providers.searxng?.baseUrl ?? process.env.SEARXNG_BASE_URL ?? 'http://localhost:8080';

  const rawTools: ToolSet = {
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
    rename: rename(cwd),
    directoryTree: directoryTree(cwd),
    webSearch: webSearch(searxngBaseUrl),
    diffFiles: diffFiles(cwd),
  };

  // Normalize nullable params for cross-provider compatibility
  const allTools: ToolSet = {};
  for (const [name, toolDef] of Object.entries(rawTools)) {
    allTools[name] = normalizeNullableParams(toolDef);
  }

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
