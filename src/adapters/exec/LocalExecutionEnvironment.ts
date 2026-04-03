import { spawn } from "node:child_process";
import type {
  IExecutionEnvironment,
  ExecutionResult,
  ExecutionOptions,
} from "#core/interfaces/IExecutionEnvironment.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576; // 1MB

export class LocalExecutionEnvironment implements IExecutionEnvironment {
  execute(command: string, cwd?: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? process.env.ComSpec ?? "cmd.exe" : process.env.SHELL ?? "/bin/sh";
    const shellArgs = isWindows ? ["/d", "/s", "/c", command] : ["-lc", command];

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

    return new Promise((resolve) => {
      const child = spawn(shell, shellArgs, {
        cwd,
        windowsHide: true,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 5000);
      }, timeoutMs);

      if (options?.stdin != null) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      }

      child.stdout?.on("data", (data: Buffer) => {
        const chunk = String(data);
        if (!stdoutTruncated) {
          stdoutBytes += Buffer.byteLength(chunk);
          if (stdoutBytes > maxBytes) {
            stdoutTruncated = true;
            stdout += chunk.slice(0, Math.max(0, chunk.length - (stdoutBytes - maxBytes)));
          } else {
            stdout += chunk;
          }
        }
      });

      child.stderr?.on("data", (data: Buffer) => {
        const chunk = String(data);
        if (!stderrTruncated) {
          stderrBytes += Buffer.byteLength(chunk);
          if (stderrBytes > maxBytes) {
            stderrTruncated = true;
            stderr += chunk.slice(0, Math.max(0, chunk.length - (stderrBytes - maxBytes)));
          } else {
            stderr += chunk;
          }
        }
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (stdoutTruncated) stdout += "\n[output truncated at 1MB]";
        if (stderrTruncated) stderr += "\n[output truncated at 1MB]";
        if (timedOut) stderr += `\n[command timed out after ${timeoutMs / 1000}s]`;
        resolve({
          stdout,
          stderr,
          exitCode: timedOut ? 124 : (code ?? 0),
        });
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: stderr + String(error.message ?? error),
          exitCode: 1,
        });
      });
    });
  }
}
