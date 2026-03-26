import type { FileChange } from "../entities/FileChange.js";

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
}
