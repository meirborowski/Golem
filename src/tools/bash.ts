import { tool } from 'ai';
import { z } from 'zod';
import { execAsync } from '../utils/exec-async.js';

const DEFAULT_TIMEOUT = 30_000; // 30 seconds

export const bash = (cwd: string) =>
  tool({
    description:
      'Execute a shell command. The command runs in the project working directory. Use for running builds, tests, git commands, etc.',
    inputSchema: z.object({
      command: z.string().describe('The shell command to execute'),
      timeout: z.union([z.number(), z.null()]).describe('Timeout in milliseconds. Null defaults to 30000.'),
    }),
    execute: async ({ command, timeout: rawTimeout }) => {
      const timeout = rawTimeout ?? DEFAULT_TIMEOUT;
      const result = await execAsync(command, { cwd, timeout });

      if (result.exitCode === 0) {
        return {
          success: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: 0,
        };
      }

      return {
        success: false,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        error: result.stderr || `Command exited with code ${result.exitCode}`,
      };
    },
  });
