import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";
import type { FileChange } from "#core/entities/FileChange.js";

export class CliAdapter implements IUserInterface {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({ input: stdin, output: stdout });
  }

  async prompt(message?: string): Promise<string> {
    return this.rl.question(message ?? "> ");
  }

  display(message: string): void {
    console.log(message);
  }

  displayStream(chunk: string): void {
    process.stdout.write(chunk);
  }

  displayStreamEnd(): void {
    process.stdout.write("\n");
  }

  async confirmChanges(changes: FileChange[]): Promise<FileChange[]> {
    if (changes.length === 0) return [];

    this.display(`\n--- ${changes.length} pending change(s) ---`);

    for (const change of changes) {
      this.display(`  [${change.operation.toUpperCase()}] ${change.filePath}`);
      if (change.description) {
        this.display(`    ${change.description}`);
      }
    }

    const answer = await this.prompt("\nApply all changes? (y/n) ");
    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      return changes;
    }
    return [];
  }

  displayError(message: string): void {
    console.error(`[ERROR] ${message}`);
  }

  displayToolCall(toolName: string, args: Record<string, unknown>): void {
    console.log(`[TOOL] ${toolName}(${JSON.stringify(args)})`);
  }

  displayToolResult(toolName: string, result: string): void {
    const summary = result.length > 100 ? result.slice(0, 100) + "..." : result;
    console.log(`[RESULT] ${toolName}: ${summary}`);
  }

  showProgress(message: string): () => void {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;
    const interval = setInterval(() => {
      process.stdout.write(`\r${frames[i++ % frames.length]} ${message}`);
    }, 80);

    return () => {
      clearInterval(interval);
      process.stdout.write("\r" + " ".repeat(message.length + 4) + "\r");
    };
  }

  updateTodos(): void {}

  close(): void {
    this.rl.close();
  }
}
