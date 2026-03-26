export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface IExecutionEnvironment {
  execute(command: string, cwd?: string): Promise<ExecutionResult>;
}
