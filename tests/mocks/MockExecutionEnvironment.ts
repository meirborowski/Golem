import type {
  IExecutionEnvironment,
  ExecutionResult,
  ExecutionOptions,
} from "#core/interfaces/IExecutionEnvironment.js";

export class MockExecutionEnvironment implements IExecutionEnvironment {
  private responses: ExecutionResult[];
  private callIndex = 0;
  public executedCommands: string[] = [];
  public executedOptions: (ExecutionOptions | undefined)[] = [];

  constructor(responses: ExecutionResult[] = []) {
    this.responses = responses;
  }

  async execute(command: string, _cwd?: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    this.executedCommands.push(command);
    this.executedOptions.push(options);
    if (this.callIndex < this.responses.length) {
      return this.responses[this.callIndex++];
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  }
}
