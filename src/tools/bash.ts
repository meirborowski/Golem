import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'node:child_process';

const DEFAULT_TIMEOUT = 30_000; // 30 seconds

export const bash = (cwd: string) =>
  tool({
    description:
      'Execute a shell command. The command runs in the project working directory. Use for running builds, tests, git commands, etc.',
    parameters: z.object({
      command: z.string().describe('The shell command to execute'),
      timeout: z
        .number()
        .optional()
        .default(DEFAULT_TIMEOUT)
        .describe('Timeout in milliseconds (default: 30000)'),
    }),
    execute: async ({ command, timeout }) => {
      try {
        const stdout = execSync(command, {
          cwd,
          timeout,
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024, // 1MB
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        return {
          success: true,
          stdout: stdout.trim(),
          stderr: '',
          exitCode: 0,
        };
      } catch (error: unknown) {
        const execError = error as {
          stdout?: string;
          stderr?: string;
          status?: number;
          message?: string;
        };

        return {
          success: false,
          stdout: (execError.stdout ?? '').trim(),
          stderr: (execError.stderr ?? '').trim(),
          exitCode: execError.status ?? 1,
          error: execError.message ?? 'Command failed',
        };
      }
    },
  });
