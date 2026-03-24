import type { ToolSet } from './tool-registry.js';
import type { ProviderEntry, ResolvedConfig } from './types.js';
import type { ToolMiddleware } from './middleware.js';

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

  /** Contribute tool middleware. Called once at tool creation time. */
  middleware?: (config: ResolvedConfig) => ToolMiddleware[];

  /** Contribute LLM providers. */
  providers?: () => Record<string, ProviderEntry>;
}
