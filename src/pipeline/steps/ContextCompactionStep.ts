import { generateText } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import type { IPipelineStep, NextFunction } from "#core/interfaces/IPipelineStep.js";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

export interface CompactionConfig {
  maxContextTokens: number;
  compactionThreshold: number;
  targetAfterCompaction: number;
  protectedTurnCount: number;
}

const SUMMARIZATION_PROMPT = `You are a conversation summarizer for a coding agent called Golem. Your job is to condense earlier conversation history into a concise summary that preserves all information the agent needs to continue working effectively.

Your summary MUST preserve:
- All file paths that were read, written, or mentioned
- Key decisions made and their rationale
- Errors encountered and how they were resolved
- The overall task trajectory and current state
- Any constraints, requirements, or preferences the user stated
- Tool results that contained important findings

Your summary should be written as factual notes, not as a narrative. Use bullet points. Be concise but complete — losing critical context will break the agent's ability to continue the task.`;

export class ContextCompactionStep implements IPipelineStep {
  name = "ContextCompaction";

  constructor(
    private model: LanguageModel,
    private ui: IUserInterface,
    private config: CompactionConfig,
  ) {}

  async execute(context: AgentContext, next: NextFunction): Promise<void> {
    const estimatedTokens = this.estimateTokens(context);

    if (estimatedTokens > this.config.maxContextTokens * this.config.compactionThreshold) {
      await this.compact(context);
    }

    await next();
  }

  private estimateTokens(context: AgentContext): number {
    if (context.tokenUsage && context.tokenUsage.lastInputTokens > 0) {
      return context.tokenUsage.lastInputTokens;
    }
    return Math.ceil(JSON.stringify(context.messages).length / 4);
  }

  private async compact(context: AgentContext): Promise<void> {
    const { headEnd, tailStart } = this.findProtectedRanges(context.messages);

    if (tailStart <= headEnd) {
      return;
    }

    const compactableMessages = context.messages.slice(headEnd, tailStart);
    if (compactableMessages.length === 0) {
      return;
    }

    this.truncateToolResults(compactableMessages);

    const afterTruncation = this.estimateTokensFromMessages(context.messages);
    const target = this.config.maxContextTokens * this.config.targetAfterCompaction;

    if (afterTruncation <= target) {
      this.ui.display("Context compressed — truncated large tool results to stay within token limits.");
      return;
    }

    const summary = await this.summarize(compactableMessages);

    const head = context.messages.slice(0, headEnd);
    const tail = context.messages.slice(tailStart);
    const summaryMessage: ModelMessage = {
      role: "system",
      content: `Summary of earlier conversation:\n\n${summary}`,
    };

    context.messages.length = 0;
    context.messages.push(...head, summaryMessage, ...tail);

    this.ui.display(
      `Context compressed — summarized ${compactableMessages.length} earlier messages to stay within token limits.`,
    );
  }

  private findProtectedRanges(messages: ModelMessage[]): { headEnd: number; tailStart: number } {
    let headEnd = 0;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === "system") {
        headEnd = i + 1;
      } else {
        break;
      }
    }

    let turnsFound = 0;
    let tailStart = messages.length;
    for (let i = messages.length - 1; i >= headEnd; i--) {
      if (messages[i].role === "user") {
        turnsFound++;
        if (turnsFound >= this.config.protectedTurnCount) {
          tailStart = i;
          break;
        }
      }
    }

    return { headEnd, tailStart };
  }

  private truncateToolResults(messages: ModelMessage[]): void {
    const TOOL_RESULT_LIMIT = 2000;

    for (const msg of messages) {
      if (msg.role !== "tool" || !Array.isArray(msg.content)) continue;

      for (const part of msg.content) {
        if (part.type !== "tool-result") continue;

        const output = part.output;
        if (output.type === "text" && output.value.length > TOOL_RESULT_LIMIT) {
          const original = output.value;
          output.value = `[Truncated tool result — originally ${original.length} chars. Start: ${original.slice(0, 200)}...]`;
        } else if (output.type === "json") {
          const serialized = JSON.stringify(output.value);
          if (serialized.length > TOOL_RESULT_LIMIT) {
            (output as { type: string; value: unknown }).type = "text";
            (output as { type: string; value: unknown }).value =
              `[Truncated tool result — originally ${serialized.length} chars. Start: ${serialized.slice(0, 200)}...]`;
          }
        }
      }
    }
  }

  private async summarize(messages: ModelMessage[]): Promise<string> {
    const conversationText = messages
      .map((msg) => {
        const content = typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
        return `[${msg.role}]: ${content}`;
      })
      .join("\n\n");

    try {
      const { text } = await generateText({
        model: this.model,
        messages: [
          { role: "system", content: SUMMARIZATION_PROMPT },
          { role: "user", content: `Summarize this conversation history:\n\n${conversationText}` },
        ],
      });
      return text;
    } catch {
      return conversationText.slice(0, 2000) + "\n\n[Summary truncated due to error]";
    }
  }

  private estimateTokensFromMessages(messages: ModelMessage[]): number {
    return Math.ceil(JSON.stringify(messages).length / 4);
  }
}
