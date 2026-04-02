import type { FileChange } from "./FileChange.js";
import type { TokenUsage, SessionTokenUsage } from "./AgentContext.js";

export interface SubAgentResult {
  textOutput: string;
  pendingChanges: FileChange[];
  tokenUsage?: TokenUsage;
  sessionTokenUsage?: SessionTokenUsage;
  error?: string;
}
