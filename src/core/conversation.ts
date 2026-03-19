import { streamText } from 'ai';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CoreMessage, LanguageModel, StreamEvent, TokenUsage, ResolvedConfig } from './types.js';
import type { ToolSet } from './tool-registry.js';
import { detectProject } from '../utils/detect-project.js';
import { logger } from '../utils/logger.js';

const PROJECT_DOC_FILES = ['GOLEM.md', 'CLAUDE.md', 'README.md'];
const MAX_DOC_CHARS = 8000; // Cap to avoid blowing the context window

export class ConversationEngine {
  private messages: CoreMessage[] = [];
  private totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  constructor(
    private model: LanguageModel,
    private readonly tools: ToolSet,
    private readonly config: ResolvedConfig,
  ) {}

  async *sendMessage(userMessage: string): AsyncGenerator<StreamEvent> {
    this.messages.push({ role: 'user', content: userMessage });

    // Truncate context if it exceeds the window
    const truncated = this.truncateMessages();
    if (truncated > 0) {
      logger.info(`Truncated ${truncated} old messages to fit context window`);
    }

    logger.info('Sending message', { messageCount: this.messages.length });

    try {
      const result = streamText({
        model: this.model,
        system: this.buildSystemPrompt(),
        messages: this.messages,
        tools: this.tools,
        maxSteps: 1000,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      let assistantText = '';

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            assistantText += part.textDelta;
            yield { type: 'text-delta', text: part.textDelta };
            break;

          case 'tool-call':
            logger.debug('Tool call', { tool: part.toolName, args: part.args });
            yield {
              type: 'tool-call',
              toolName: part.toolName,
              toolCallId: part.toolCallId,
              args: part.args,
            };
            break;

          case 'tool-result':
            logger.debug('Tool result', { tool: part.toolName });
            yield {
              type: 'tool-result',
              toolName: part.toolName,
              toolCallId: part.toolCallId,
              result: part.result,
            };
            break;

          case 'step-finish':
            // A step finished (could be followed by another if tools were called)
            break;

          case 'finish':
            if (part.usage) {
              this.totalUsage.promptTokens += part.usage.promptTokens;
              this.totalUsage.completionTokens += part.usage.completionTokens;
              this.totalUsage.totalTokens += part.usage.totalTokens;
            }
            break;

          case 'error':
            yield { type: 'error', error: new Error(String(part.error)) };
            break;
        }
      }

      // Add the assistant response to history
      if (assistantText) {
        this.messages.push({ role: 'assistant', content: assistantText });
      }

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

  getMessages(): CoreMessage[] {
    return [...this.messages];
  }

  getTokenUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  clearHistory(): void {
    this.messages = [];
    this.totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  loadHistory(messages: CoreMessage[], usage?: TokenUsage): void {
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

  private estimateMessageTokens(msg: CoreMessage): number {
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
    const parts: string[] = [
      'You are Golem, an AI coding assistant running in the terminal.',
      'You help users read, understand, and edit code in their projects.',
      '',
      '## Guidelines',
      '- Be concise and direct in your responses.',
      '- Use the available tools to read and modify files when asked.',
      '- Always read a file before editing it.',
      '- When editing files, provide enough context in oldText to ensure a unique match.',
      '- Show relevant code snippets in your responses using markdown code blocks.',
      '- If you are unsure about something, say so rather than guessing.',
      '- Be efficient with tool calls. Read only the files you need — don\'t read every file in the project.',
      '- After gathering enough context, respond with your answer. Don\'t keep reading more files.',
      '',
      `## Working Directory`,
      `Current directory: ${this.config.cwd}`,
    ];

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

    // Load project docs (GOLEM.md, CLAUDE.md, or README.md)
    const doc = this.loadProjectDoc();
    if (doc) {
      parts.push('');
      parts.push(`## Project Documentation (from ${doc.file})`);
      parts.push(doc.content);
    }

    parts.push('');
    parts.push('## Available Tools');
    parts.push('- readFile: Read file contents with optional line range');
    parts.push('- writeFile: Create or overwrite files with given content');
    parts.push('- editFile: Apply find-and-replace edits to files');
    parts.push('- listFiles: Find files matching glob patterns');
    parts.push('- searchFiles: Search file contents with regex');
    parts.push('- bash: Execute shell commands');
    parts.push('- git: Git operations (status, diff, log, commit, push, branch, etc.)');

    return parts.join('\n');
  }
}
