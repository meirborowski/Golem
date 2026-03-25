/**
 * PromptBuilder subscriber — Assembles the system prompt from agent config,
 * extension sections, tool metadata, MCP tool descriptions, and memory.
 *
 * Listens: tool:registered, tool:unregistered, config:changed
 * Provides: getSystemPrompt() for StreamCoordinator to read synchronously
 */

import type { EventBus, Unsubscribe } from '../bus/event-bus.js';
import type { ResolvedConfig } from '../core/types.js';
import type { AgentConfig } from '../agents/agent-types.js';
import type { ExtensionRegistry } from '../core/extension-registry.js';
import { loadMemoryForPrompt } from '../core/memory.js';

interface ToolDescription {
  name: string;
  description: string;
  source: 'builtin' | 'mcp' | 'extension';
  mcpServer?: string;
}

export class PromptBuilder {
  private toolDescriptions = new Map<string, ToolDescription>();
  private cachedPrompt: string | null = null;
  private disposers: Unsubscribe[] = [];

  constructor(
    private bus: EventBus,
    private config: ResolvedConfig,
    private agent: AgentConfig,
    private registry: ExtensionRegistry | null = null,
  ) {
    this.disposers.push(
      bus.on('tool:registered', (e) => {
        this.toolDescriptions.set(e.toolName, {
          name: e.toolName,
          description: e.description,
          source: e.source,
          mcpServer: e.mcpServer,
        });
        this.cachedPrompt = null; // Invalidate cache
      }),
      bus.on('tool:unregistered', (e) => {
        this.toolDescriptions.delete(e.toolName);
        this.cachedPrompt = null;
      }),
      bus.on('config:changed', () => {
        this.cachedPrompt = null;
      }),
    );
  }

  /** Update the agent config (e.g., on agent switch). */
  setAgent(agent: AgentConfig): void {
    this.agent = agent;
    this.cachedPrompt = null;
  }

  /** Get the assembled system prompt. Cached until invalidated by events. */
  getSystemPrompt(): string {
    if (this.cachedPrompt !== null) return this.cachedPrompt;

    const parts: string[] = [];

    // Agent identity
    const identity = this.agent.sections['identity'];
    if (identity) {
      parts.push(identity);
    }

    // Agent guidelines
    const guidelines = this.agent.sections['guidelines'];
    if (guidelines) {
      parts.push('');
      parts.push('## Guidelines');
      parts.push(guidelines);
    }

    // Extension-contributed sections
    if (this.registry) {
      const sections = this.registry.collectSystemPromptSections(this.config);
      for (const section of sections) {
        parts.push('');
        if (section.title) {
          parts.push(`## ${section.title}`);
        }
        parts.push(section.content);
      }
    }

    // Tool descriptions from agent's resolved tool metadata
    const toolMetaEntries = Object.entries(this.agent.toolMeta);
    if (toolMetaEntries.length > 0) {
      parts.push('');
      parts.push('## Available Tools');
      for (const [name, meta] of toolMetaEntries) {
        parts.push(`- ${name}: ${meta.description}`);
        if (meta.whenToUse) {
          parts.push(`  When to use: ${meta.whenToUse}`);
        }
      }
    }

    // MCP tool descriptions
    const mcpTools = Array.from(this.toolDescriptions.values()).filter((t) => t.source === 'mcp');
    if (mcpTools.length > 0) {
      parts.push('');
      parts.push('## MCP Server Tools');
      const byServer = new Map<string, ToolDescription[]>();
      for (const desc of mcpTools) {
        const server = desc.mcpServer ?? 'unknown';
        const list = byServer.get(server) ?? [];
        list.push(desc);
        byServer.set(server, list);
      }
      byServer.forEach((tools, server) => {
        parts.push(`From "${server}":`);
        for (const t of tools) {
          parts.push(`- ${t.name}: ${t.description}`);
        }
      });
    }

    // Agent behavior
    const behavior = this.agent.sections['behavior'];
    if (behavior) {
      parts.push('');
      parts.push('## Agent Behavior');
      parts.push(behavior);
    }

    // Memory context
    const memoryContent = loadMemoryForPrompt(this.config.cwd);
    if (memoryContent) {
      parts.push('');
      parts.push('## Remembered Context');
      parts.push(memoryContent);
    }

    this.cachedPrompt = parts.join('\n');
    return this.cachedPrompt;
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
  }
}
