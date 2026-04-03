import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";
import type { FileChange } from "#core/entities/FileChange.js";

export class CliAdapter implements IUserInterface {
  private rl: readline.Interface;
  private _toolCount = 0;
  private _toolErrors = 0;

  constructor() {
    this.rl = readline.createInterface({ input: stdin, output: stdout });
  }

  async prompt(message?: string): Promise<string> {
    if (this._toolCount > 0) {
      process.stdout.write(`\r⚡ ${this._toolCount} tool${this._toolCount !== 1 ? "s" : ""} used${this._toolErrors > 0 ? ` (${this._toolErrors} failed)` : ""}` + " ".repeat(20) + "\n");
      this._toolCount = 0;
      this._toolErrors = 0;
    }
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

  displayToolCall(_toolName: string, _args: Record<string, unknown>): void {
    this._toolCount++;
    process.stdout.write(`\r⚡ Working... (${this._toolCount} tool${this._toolCount !== 1 ? "s" : ""})`);
  }

  displayToolResult(_toolName: string, result: string): void {
    const isError = result.toLowerCase().startsWith("error");
    if (isError) {
      this._toolErrors++;
      const summary = result.length > 100 ? result.slice(0, 100) + "..." : result;
      process.stdout.write("\n");
      console.log(`[ERROR] ${summary}`);
    }
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

  updateTokenUsage(): void {}

  close(): void {
    this.rl.close();
  }
}
