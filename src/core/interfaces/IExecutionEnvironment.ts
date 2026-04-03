export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecutionOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
  stdin?: string;
}

export interface IExecutionEnvironment {
  execute(command: string, cwd?: string, options?: ExecutionOptions): Promise<ExecutionResult>;
}
