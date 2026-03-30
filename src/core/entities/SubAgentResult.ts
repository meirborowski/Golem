import type { FileChange } from "./FileChange.js";
import type { TokenUsage } from "./AgentContext.js";

export interface SubAgentResult {
  textOutput: string;
  pendingChanges: FileChange[];
  tokenUsage?: TokenUsage;
  error?: string;
}
