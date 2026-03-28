import { spawn } from "node:child_process";
import type { IExecutionEnvironment, ExecutionResult } from "#core/interfaces/IExecutionEnvironment.js";

export class LocalExecutionEnvironment implements IExecutionEnvironment {
  execute(command: string, cwd?: string): Promise<ExecutionResult> {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? process.env.ComSpec ?? "cmd.exe" : process.env.SHELL ?? "/bin/sh";
    const shellArgs = isWindows ? ["/d", "/s", "/c", command] : ["-lc", command];

    return new Promise((resolve) => {
      const child = spawn(shell, shellArgs, {
        cwd,
        windowsHide: true,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += String(data);
      });

      child.stderr?.on("data", (data) => {
        stderr += String(data);
      });

      child.on("close", (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      child.on("error", (error) => {
        resolve({
          stdout,
          stderr: stderr + String(error.message ?? error),
          exitCode: 1,
        });
      });
    });
  }
}
