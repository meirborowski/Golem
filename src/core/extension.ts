import type { ToolSet } from './tool-registry.js';
import type { ProviderEntry, ResolvedConfig } from './types.js';

// ── Command Definition ───────────────────────────────────────────────────────

export type { CommandContext, CommandResult } from './command-handler.js';

export interface CommandDefinition {
  /** Short description shown in /help. */
  description: string;
  /** Execute the command. `arg` is the text after the command name. */
  execute: (arg: string, context: import('./command-handler.js').CommandContext) => import('./command-handler.js').CommandResult;
}

// ── System Prompt Section ────────────────────────────────────────────────────

export interface SystemPromptSection {
  /** Section heading (e.g. "Working Directory"). Empty string = no heading. */
  title: string;
  /** Section body text. */
  content: string;
  /** Sort priority — lower runs earlier. Default 50. */
  order?: number;
}

// ── Middleware (legacy type for extension interface compat) ──────────────────

/** @deprecated Middleware is now handled internally by ToolExecutor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolMiddleware = (ctx: any, next: () => Promise<unknown>) => Promise<unknown>;

// ── Extension Interface ──────────────────────────────────────────────────────

export interface GolemExtension {
  /** Unique name for this extension. */
  name: string;

  /** Contribute tools. Called once with the working directory. */
  tools?: (cwd: string, config: ResolvedConfig) => ToolSet;

  /** Contribute slash commands. */
  commands?: Record<string, CommandDefinition>;

  /** Contribute system prompt sections. Called each time the prompt is built. */
  systemPromptSections?: (config: ResolvedConfig) => SystemPromptSection[];

  /** @deprecated Middleware is now handled internally by ToolExecutor. */
  middleware?: (config: ResolvedConfig) => ToolMiddleware[];

  /** Contribute LLM providers. */
  providers?: () => Record<string, ProviderEntry>;
}
