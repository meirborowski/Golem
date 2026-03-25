import { z } from 'zod';
import type { ResolvedConfig } from './types.js';
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
 * Create tools from the extension registry, filter by agent, and normalize.
 * Approval/middleware is now handled by ToolExecutor subscriber.
 */
export function createBuiltinTools(
  config: ResolvedConfig,
  registry: ExtensionRegistry,
  _onApprovalNeeded?: unknown,
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

  return allTools;
}
