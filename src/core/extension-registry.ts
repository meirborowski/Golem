import type { GolemExtension, CommandDefinition, SystemPromptSection } from './extension.js';
import type { ToolSet } from './tool-registry.js';
import type { ProviderEntry, ResolvedConfig } from './types.js';
import type { ToolMiddleware } from './middleware.js';

export class ExtensionRegistry {
  private extensions: GolemExtension[] = [];

  /** Register an extension. Later registrations win on name collisions. */
  register(ext: GolemExtension): void {
    this.extensions.push(ext);
  }

  /** Register multiple extensions at once. */
  registerAll(exts: GolemExtension[]): void {
    for (const ext of exts) {
      this.register(ext);
    }
  }

  /** Get all registered extension names. */
  getExtensionNames(): string[] {
    return this.extensions.map((e) => e.name);
  }

  // ── Collect Tools ────────────────────────────────────────────────────────

  /** Merge tools from all extensions. Later extensions override earlier ones on name collision. */
  collectTools(cwd: string, config: ResolvedConfig): ToolSet {
    const all: ToolSet = {};
    for (const ext of this.extensions) {
      if (ext.tools) {
        Object.assign(all, ext.tools(cwd, config));
      }
    }
    return all;
  }

  // ── Collect Commands ─────────────────────────────────────────────────────

  /** Merge commands from all extensions. Later extensions override on name collision. */
  collectCommands(): Map<string, CommandDefinition> {
    const map = new Map<string, CommandDefinition>();
    for (const ext of this.extensions) {
      if (ext.commands) {
        for (const [name, def] of Object.entries(ext.commands)) {
          map.set(name, def);
        }
      }
    }
    return map;
  }

  // ── Collect System Prompt Sections ───────────────────────────────────────

  /** Collect and sort system prompt sections from all extensions. */
  collectSystemPromptSections(config: ResolvedConfig): SystemPromptSection[] {
    const sections: SystemPromptSection[] = [];
    for (const ext of this.extensions) {
      if (ext.systemPromptSections) {
        sections.push(...ext.systemPromptSections(config));
      }
    }
    // Stable sort by order (default 50)
    sections.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    return sections;
  }

  // ── Collect Middleware ────────────────────────────────────────────────────

  /** Collect middleware from all extensions, in registration order. */
  collectMiddleware(config: ResolvedConfig): ToolMiddleware[] {
    const all: ToolMiddleware[] = [];
    for (const ext of this.extensions) {
      if (ext.middleware) {
        all.push(...ext.middleware(config));
      }
    }
    return all;
  }

  // ── Collect Providers ────────────────────────────────────────────────────

  /** Merge providers from all extensions. Later extensions override on name collision. */
  collectProviders(): Map<string, ProviderEntry> {
    const map = new Map<string, ProviderEntry>();
    for (const ext of this.extensions) {
      if (ext.providers) {
        const entries = ext.providers();
        for (const [name, entry] of Object.entries(entries)) {
          map.set(name, entry);
        }
      }
    }
    return map;
  }
}
