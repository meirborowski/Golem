import type { IUserInterface } from "./interfaces/IUserInterface.js";
import type { FileChange } from "./entities/FileChange.js";

/**
 * Silent IUserInterface for sub-agents.
 * Buffers streamed text, auto-approves changes, never prompts the user.
 */
export class HeadlessUI implements IUserInterface {
  private chunks: string[] = [];

  async prompt(): Promise<string> {
    return "";
  }

  display(): void {}

  displayStream(chunk: string): void {
    this.chunks.push(chunk);
  }

  displayStreamEnd(): void {}

  async confirmChanges(changes: FileChange[]): Promise<FileChange[]> {
    return changes;
  }

  displayError(): void {}

  displayToolCall(): void {}

  displayToolResult(): void {}

  showProgress(): () => void {
    return () => {};
  }

  updateTodos(): void {}

  getTextOutput(): string {
    return this.chunks.join("");
  }
}
