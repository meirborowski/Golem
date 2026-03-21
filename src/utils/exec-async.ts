import { exec } from 'node:child_process';

const MAX_OUTPUT = 1024 * 1024; // 1MB

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a shell command asynchronously so the Node.js event loop stays
 * responsive. Unlike `execSync`, this lets Ink continue rendering while
 * long-running commands (tests, builds, git operations) execute.
 */
export function execAsync(
  command: string,
  options: { cwd: string; timeout?: number },
): Promise<ExecResult> {
  const timeout = options.timeout ?? 30_000;

  return new Promise((resolve) => {
    const child = exec(command, {
      cwd: options.cwd,
      timeout,
      maxBuffer: MAX_OUTPUT,
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      if (error) {
        // `exec` provides the exit code on the error object
        const exitCode = (error as NodeJS.ErrnoException & { code?: number | string }).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
          ? 1
          : error.killed
            ? 124  // timeout
            : (error as unknown as { status?: number }).status ?? 1;

        resolve({
          stdout: (stdout ?? '').trim(),
          stderr: (stderr ?? '').trim() || (error.killed ? `Command timed out after ${timeout}ms` : error.message),
          exitCode,
        });
        return;
      }

      resolve({
        stdout: (stdout ?? '').trim(),
        stderr: (stderr ?? '').trim(),
        exitCode: child?.exitCode ?? 0,
      });
    });
  });
}
