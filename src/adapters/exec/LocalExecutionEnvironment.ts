import { exec } from "node:child_process";
import type { IExecutionEnvironment, ExecutionResult } from "#core/interfaces/IExecutionEnvironment.js";

export class LocalExecutionEnvironment implements IExecutionEnvironment {
  execute(command: string, cwd?: string): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      exec(command, { cwd }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: error?.code ?? 0,
        });
      });
    });
  }
}
