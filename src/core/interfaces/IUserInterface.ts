import type { FileChange } from "../entities/FileChange.js";
import type { TodoItem } from "../entities/TodoItem.js";
import type { SessionTokenUsage } from "../entities/AgentContext.js";

export interface IUserInterface {
  prompt(message?: string): Promise<string>;
  display(message: string): void;
  displayStream(chunk: string): void;
  displayStreamEnd(): void;
  confirmChanges(changes: FileChange[]): Promise<FileChange[]>;
  displayError(message: string): void;
  displayToolCall(toolName: string, args: Record<string, unknown>): void;
  displayToolResult(toolName: string, result: string): void;
  showProgress(message: string): () => void;
  updateTodos(items: TodoItem[]): void;
  updateTokenUsage(session: SessionTokenUsage): void;
}
