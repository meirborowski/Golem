import { z } from 'zod';
import { isGitReadOnly } from '../tools/index.js';
import type { ResolvedConfig, ApprovalCallback } from './types.js';
import type { ToolMiddleware } from './middleware.js';
import { applyMiddleware } from './middleware.js';
import { createApprovalMiddleware } from './middlewares/approval.js';
import type { ExtensionRegistry } from './extension-registry.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolSet = Record<string, any>;

export interface ToolMeta {
  description: string;
  whenToUse: string;
}

/**
 * Extract metadata (description + whenToUse) from a ToolSet.
 * Tools are expected to have these as properties (added via Object.assign).
 */
export function getToolMeta(tools: ToolSet): Record<string, ToolMeta> {
  const meta: Record<string, ToolMeta> = {};
  for (const [name, toolDef] of Object.entries(tools)) {
    meta[name] = {
      description: (toolDef?.description as string) ?? '',
      whenToUse: (toolDef?.whenToUse as string) ?? '',
    };
  }
  return meta;
}

/**
 * Wrap a tool's parameters schema so that missing nullable properties
 * default to null before Zod validation. This keeps all properties in the
 * JSON schema's `required` array (satisfying OpenAI) while still handling
 * providers like Gemini that omit optional parameters entirely.
 */
export function normalizeNullableParams(toolDef: ToolSet[string]): ToolSet[string] {
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

/**
 * Built-in conditional check functions for tools that support "conditional" approval mode.
 * Returns true if the specific invocation needs approval.
 */
export const CONDITIONAL_CHECKS: Record<string, (args: unknown) => boolean> = {
  git: (args: unknown) => {
    const { subcommand, args: gitArgs } = args as { subcommand: string; args: string | null };
    return !isGitReadOnly(subcommand, gitArgs);
  },
};

/**
 * Create tools from the extension registry, filter by agent, normalize, and apply middleware.
 */
export function createBuiltinTools(
  config: ResolvedConfig,
  registry: ExtensionRegistry,
  onApprovalNeeded?: ApprovalCallback,
  toolNames?: string[],
): ToolSet {
  // Collect tools from all registered extensions
  const rawTools = registry.collectTools(config.cwd, config);

  // Filter to agent's allowed tools, then normalize
  const allowedNames = toolNames ? new Set(toolNames) : null;
  const allTools: ToolSet = {};
  for (const [name, toolDef] of Object.entries(rawTools)) {
    if (allowedNames && !allowedNames.has(name)) continue;
    allTools[name] = normalizeNullableParams(toolDef);
  }

  // Collect middleware from extensions + add approval middleware
  const middlewares: ToolMiddleware[] = [];

  if (onApprovalNeeded) {
    middlewares.push(createApprovalMiddleware(config.approval, onApprovalNeeded, CONDITIONAL_CHECKS));
  }

  middlewares.push(...registry.collectMiddleware(config));

  // Apply middleware pipeline to each tool
  if (middlewares.length > 0) {
    for (const name of Object.keys(allTools)) {
      allTools[name] = applyMiddleware(allTools[name], name, config, middlewares);
    }
  }

  return allTools;
}
