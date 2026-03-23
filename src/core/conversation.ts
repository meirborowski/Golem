import { streamText, stepCountIs } from 'ai';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelMessage, LanguageModel, StreamEvent, TokenUsage, ResolvedConfig } from './types.js';
import type { ToolSet } from './tool-registry.js';
import type { McpToolDescription } from './mcp-client.js';
import type { AgentConfig } from '../agents/agent-types.js';
import { detectProject } from '../utils/detect-project.js';
import { loadMemoryForPrompt } from './memory.js';
import { logger } from '../utils/logger.js';

const PROJECT_DOC_FILES = ['GOLEM.md', 'CLAUDE.md', 'README.md'];
const MAX_DOC_CHARS = 8000; // Cap to avoid blowing the context window

export class ConversationEngine {
  private messages: ModelMessage[] = [];
  private totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private mcpToolDescriptions: McpToolDescription[] = [];

  constructor(
    private model: LanguageModel,
    private tools: ToolSet,
    private readonly config: ResolvedConfig,
    private agent: AgentConfig,
  ) {}

  setAgent(agent: AgentConfig): void {
    this.agent = agent;
  }

  setMcpToolDescriptions(descriptions: McpToolDescription[]): void {
    this.mcpToolDescriptions = descriptions;
  }

  /** Merge additional tools into the engine's tool set (e.g. MCP tools loaded after init). */
  mergeTools(extraTools: ToolSet): void {
    this.tools = { ...this.tools, ...extraTools };
  }

  async *sendMessage(userMessage: string): AsyncGenerator<StreamEvent> {
    this.messages.push({ role: 'user', content: userMessage });

    // Truncate context if it exceeds the window
    const truncated = this.truncateMessages();
    if (truncated > 0) {
      logger.info(`Truncated ${truncated} old messages to fit context window`);
    }

    logger.info('Sending message', { messageCount: this.messages.length });

    try {
      // Only pass temperature when explicitly configured — reasoning models
      // (e.g. o1, o3) don't support it and the SDK logs a noisy warning.
      const streamOptions: Parameters<typeof streamText>[0] = {
        model: this.model,
        system: this.buildSystemPrompt(),
        messages: this.messages,
        tools: this.tools,
        stopWhen: stepCountIs(50),
        maxOutputTokens: this.config.maxTokens,
      };
      if (this.config.temperature !== undefined) {
        streamOptions.temperature = this.config.temperature;
      }
      const result = streamText(streamOptions);

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            yield { type: 'text-delta', text: part.text };
            break;

          case 'tool-call':
            logger.debug('Tool call', { tool: part.toolName, input: part.input });
            yield {
              type: 'tool-call',
              toolName: part.toolName,
              toolCallId: part.toolCallId,
              args: part.input,
            };
            break;

          case 'tool-result':
            logger.debug('Tool result', { tool: part.toolName });
            yield {
              type: 'tool-result',
              toolName: part.toolName,
              toolCallId: part.toolCallId,
              result: part.output,
            };
            break;

          case 'finish':
            if (part.totalUsage) {
              this.totalUsage.promptTokens += part.totalUsage.inputTokens ?? 0;
              this.totalUsage.completionTokens += part.totalUsage.outputTokens ?? 0;
              this.totalUsage.totalTokens += part.totalUsage.totalTokens ?? 0;
            }
            break;

          case 'error': {
            const errMsg =
              part.error instanceof Error
                ? part.error.message
                : typeof part.error === 'string'
                  ? part.error
                  : JSON.stringify(part.error);
            yield { type: 'error', error: new Error(errMsg) };
            break;
          }
        }
      }

      // Add the full response messages to history, preserving tool calls,
      // tool results, and provider metadata (e.g. Gemini thought_signature)
      const response = await result.response;
      this.messages.push(...response.messages);

      yield { type: 'finish', usage: { ...this.totalUsage } };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Stream error', { error: err.message });
      yield { type: 'error', error: err };
    }
  }

  setModel(model: LanguageModel): void {
    this.model = model;
  }

  getMessages(): ModelMessage[] {
    return [...this.messages];
  }

  getTokenUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  clearHistory(): void {
    this.messages = [];
    this.totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  loadHistory(messages: ModelMessage[], usage?: TokenUsage): void {
    this.messages = [...messages];
    if (usage) {
      this.totalUsage = { ...usage };
    }
  }

  /**
   * Estimate token count for a message using a simple heuristic.
   * ~4 chars per token is a reasonable approximation across models.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private estimateMessageTokens(msg: ModelMessage): number {
    if (typeof msg.content === 'string') {
      return this.estimateTokens(msg.content) + 4; // +4 for role/framing overhead
    }
    // For array content (tool calls etc), stringify to estimate
    return this.estimateTokens(JSON.stringify(msg.content)) + 4;
  }

  /**
   * Truncate old messages to fit within the context window.
   * Keeps the system prompt budget, always preserves the last few messages,
   * and drops oldest messages first. Returns number of messages dropped.
   */
  private truncateMessages(): number {
    const contextWindow = this.config.contextWindow;
    const systemPromptTokens = this.estimateTokens(this.buildSystemPrompt());
    // Reserve tokens for: system prompt + max response + buffer
    const reservedTokens = systemPromptTokens + this.config.maxTokens + 200;
    const availableTokens = contextWindow - reservedTokens;

    if (availableTokens <= 0) return 0;

    // Calculate total tokens in messages
    let totalTokens = 0;
    for (const msg of this.messages) {
      totalTokens += this.estimateMessageTokens(msg);
    }

    if (totalTokens <= availableTokens) return 0;

    // Drop oldest messages (keeping at least the last 2: user + assistant pair)
    const minKeep = 2;
    let dropped = 0;

    while (
      this.messages.length > minKeep &&
      totalTokens > availableTokens
    ) {
      const removed = this.messages.shift();
      if (removed) {
        totalTokens -= this.estimateMessageTokens(removed);
        dropped++;
      }
    }

    // If we dropped messages, prepend a summary note so the AI knows context was truncated
    if (dropped > 0) {
      this.messages.unshift({
        role: 'user',
        content: `[System note: ${dropped} earlier messages were truncated to fit the context window. The conversation continues from here.]`,
      });
    }

    return dropped;
  }

  private loadProjectDoc(): { file: string; content: string } | null {
    for (const filename of PROJECT_DOC_FILES) {
      const filePath = join(this.config.cwd, filename);
      if (existsSync(filePath)) {
        try {
          let content = readFileSync(filePath, 'utf-8').trim();
          if (content.length > MAX_DOC_CHARS) {
            content = content.slice(0, MAX_DOC_CHARS) + '\n\n[... truncated]';
          }
          logger.debug(`Loaded project doc: ${filename} (${content.length} chars)`);
          return { file: filename, content };
        } catch {
          // Skip unreadable files
        }
      }
    }
    return null;
  }

  private buildSystemPrompt(): string {
    const parts: string[] = [];

    // Identity from agent config
    const identity = this.agent.sections['identity'];
    if (identity) {
      parts.push(identity);
    }

    // Guidelines from agent config
    const guidelines = this.agent.sections['guidelines'];
    if (guidelines) {
      parts.push('');
      parts.push('## Guidelines');
      parts.push(guidelines);
    }

    // Dynamic: working directory
    parts.push('');
    parts.push('## Working Directory');
    parts.push(`Current directory: ${this.config.cwd}`);

    // Dynamic: project info
    const project = detectProject(this.config.cwd);
    if (project) {
      parts.push('');
      parts.push('## Project Info');
      parts.push(`Type: ${project.type} (${project.language})`);
      if (project.name) parts.push(`Name: ${project.name}`);
      if (project.frameworks.length > 0) {
        parts.push(`Frameworks: ${project.frameworks.join(', ')}`);
      }
    }

    // Dynamic: project docs
    const doc = this.loadProjectDoc();
    if (doc) {
      parts.push('');
      parts.push(`## Project Documentation (from ${doc.file})`);
      parts.push(doc.content);
    }

    // Dynamic: persistent memory
    const memoryContent = loadMemoryForPrompt(this.config.cwd);
    if (memoryContent) {
      parts.push('');
      parts.push('## Remembered Context');
      parts.push(memoryContent);
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

    // Dynamic: MCP tool descriptions
    if (this.mcpToolDescriptions.length > 0) {
      parts.push('');
      parts.push('## MCP Server Tools');
      const byServer = new Map<string, McpToolDescription[]>();
      for (const desc of this.mcpToolDescriptions) {
        const list = byServer.get(desc.server) ?? [];
        list.push(desc);
        byServer.set(desc.server, list);
      }
      for (const [server, tools] of byServer) {
        parts.push(`From "${server}":`);
        for (const t of tools) {
          parts.push(`- ${t.name}: ${t.description}`);
        }
      }
    }

    // Behavior from agent config
    const behavior = this.agent.sections['behavior'];
    if (behavior) {
      parts.push('');
      parts.push('## Agent Behavior');
      parts.push(behavior);
    }

    return parts.join('\n');
  }
}
