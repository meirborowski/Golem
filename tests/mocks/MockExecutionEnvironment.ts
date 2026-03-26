import type { IExecutionEnvironment, ExecutionResult } from "#core/interfaces/IExecutionEnvironment.js";

export class MockExecutionEnvironment implements IExecutionEnvironment {
  private responses: ExecutionResult[];
  private callIndex = 0;
  public executedCommands: string[] = [];

  constructor(responses: ExecutionResult[] = []) {
    this.responses = responses;
  }

  async execute(command: string, _cwd?: string): Promise<ExecutionResult> {
    this.executedCommands.push(command);
    if (this.callIndex < this.responses.length) {
      return this.responses[this.callIndex++];
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  }
}
