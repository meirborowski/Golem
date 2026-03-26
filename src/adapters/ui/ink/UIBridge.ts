import { EventEmitter } from "node:events";
import type { FileChange } from "../../../core/entities/FileChange.js";

export interface PromptRequest {
  message: string;
  resolve: (value: string) => void;
}

export interface ConfirmRequest {
  changes: FileChange[];
  resolve: (approved: FileChange[]) => void;
}

export class UIBridge extends EventEmitter {
  requestPrompt(message: string): Promise<string> {
    return new Promise((resolve) => {
      this.emit("prompt-request", { message, resolve } satisfies PromptRequest);
    });
  }

  submitPrompt(text: string): void {
    this.emit("prompt-response", text);
  }

  pushDisplay(message: string): void {
    this.emit("display", message);
  }

  pushStreamChunk(chunk: string): void {
    this.emit("stream-chunk", chunk);
  }

  pushStreamEnd(): void {
    this.emit("stream-end");
  }

  pushError(message: string): void {
    this.emit("error", message);
  }

  requestConfirmChanges(changes: FileChange[]): Promise<FileChange[]> {
    return new Promise((resolve) => {
      this.emit("confirm-request", { changes, resolve } satisfies ConfirmRequest);
    });
  }

  submitConfirmation(approved: FileChange[]): void {
    this.emit("confirm-response", approved);
  }

  pushToolCall(toolName: string, args: Record<string, unknown>): void {
    this.emit("tool-call", { toolName, args });
  }

  pushToolResult(toolName: string, result: string): void {
    this.emit("tool-result", { toolName, result });
  }

  startProgress(message: string): void {
    this.emit("progress-start", message);
  }

  stopProgress(): void {
    this.emit("progress-stop");
  }
}
