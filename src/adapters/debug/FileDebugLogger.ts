import { appendFileSync, writeFileSync } from "node:fs";
import type { IDebugLogger } from "#core/interfaces/IDebugLogger.js";

export class FileDebugLogger implements IDebugLogger {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    writeFileSync(
      this.filePath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        category: "session",
        event: "start",
      }) + "\n",
    );
  }

  isEnabled(): boolean {
    return true;
  }

  log(category: string, event: string, data?: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      category,
      event,
      ...data,
    };
    appendFileSync(this.filePath, JSON.stringify(entry) + "\n");
  }
}
