import type { IUserInterface } from "#core/interfaces/IUserInterface.js";
import type { FileChange } from "#core/entities/FileChange.js";

export class MockUserInterface implements IUserInterface {
  public displayed: string[] = [];
  public errors: string[] = [];
  public streamedChunks: string[] = [];
  private inputs: string[];
  private inputIndex = 0;
  private approveChanges: boolean;

  constructor(inputs: string[] = [], approveChanges = true) {
    this.inputs = inputs;
    this.approveChanges = approveChanges;
  }

  async prompt(_message?: string): Promise<string> {
    if (this.inputIndex >= this.inputs.length) {
      return "exit";
    }
    return this.inputs[this.inputIndex++];
  }

  display(message: string): void {
    this.displayed.push(message);
  }

  displayStream(chunk: string): void {
    this.streamedChunks.push(chunk);
  }

  displayStreamEnd(): void {
    this.streamedChunks.push("[END]");
  }

  async confirmChanges(changes: FileChange[]): Promise<FileChange[]> {
    return this.approveChanges ? changes : [];
  }

  displayError(message: string): void {
    this.errors.push(message);
  }

  displayToolCall(_toolName: string, _args: Record<string, unknown>): void {}

  displayToolResult(_toolName: string, _result: string): void {}

  showProgress(_message: string): () => void {
    return () => {};
  }

  updateTodos(): void {}
}
