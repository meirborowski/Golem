import type { ModelMessage } from "ai";
import type { FileChange } from "./FileChange.js";

export interface TokenUsage {
  lastInputTokens: number;
  lastOutputTokens: number;
  lastTotalTokens: number;
}

export interface AgentContext {
  messages: ModelMessage[];
  currentRequest: string;
  workingDirectory: string;
  gatheredFiles: Map<string, string>;
  pendingChanges: FileChange[];
  shouldContinue: boolean;
  metadata: Record<string, unknown>;
  tokenUsage?: TokenUsage;
}
