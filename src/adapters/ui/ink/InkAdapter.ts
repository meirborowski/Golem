import React from "react";
import { render } from "ink";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";
import type { FileChange } from "#core/entities/FileChange.js";
import type { TodoItem } from "#core/entities/TodoItem.js";
import { UIBridge } from "./UIBridge.js";
import { GolemApp } from "./components/GolemApp.js";

export interface InkAdapterConfig {
  modelName?: string;
  workingDirectory?: string;
  version?: string;
}

export class InkAdapter implements IUserInterface {
  private bridge: UIBridge;
  private inkInstance: ReturnType<typeof render>;

  constructor(config: InkAdapterConfig = {}) {
    this.bridge = new UIBridge();
    this.inkInstance = render(
      React.createElement(GolemApp, { bridge: this.bridge, config })
    );
  }

  prompt(message?: string): Promise<string> {
    return this.bridge.requestPrompt(message ?? "> ");
  }

  display(message: string): void {
    this.bridge.pushDisplay(message);
  }

  displayStream(chunk: string): void {
    this.bridge.pushStreamChunk(chunk);
  }

  displayStreamEnd(): void {
    this.bridge.pushStreamEnd();
  }

  confirmChanges(changes: FileChange[]): Promise<FileChange[]> {
    if (changes.length === 0) return Promise.resolve([]);
    return this.bridge.requestConfirmChanges(changes);
  }

  displayError(message: string): void {
    this.bridge.pushError(message);
  }

  displayToolCall(toolName: string, args: Record<string, unknown>): void {
    this.bridge.pushToolCall(toolName, args);
  }

  displayToolResult(toolName: string, result: string): void {
    this.bridge.pushToolResult(toolName, result);
  }

  showProgress(message: string): () => void {
    this.bridge.startProgress(message);
    return () => this.bridge.stopProgress();
  }

  updateTodos(items: TodoItem[]): void {
    this.bridge.pushTodos(items);
  }

  close(): void {
    this.inkInstance.unmount();
  }
}
