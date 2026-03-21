import { tool } from 'ai';
import { z } from 'zod';
import { execAsync } from '../utils/exec-async.js';

const DEFAULT_TIMEOUT = 30_000; // 30 seconds

const ALWAYS_READ_ONLY = new Set(['status', 'diff', 'log', 'show', 'remote']);

/**
 * Determine whether a git subcommand + args combination is read-only.
 * Read-only operations skip user approval.
 */
export function isGitReadOnly(subcommand: string, args: string | null): boolean {
  if (ALWAYS_READ_ONLY.has(subcommand)) return true;

  const trimmedArgs = (args ?? '').trim();

  // `branch` is read-only when listing (no args, or listing flags)
  if (subcommand === 'branch') {
    if (!trimmedArgs) return true;
    return /^(-l|--list|-a|--all|-r|--remotes)\b/.test(trimmedArgs);
  }

  // `stash` is read-only when listing or showing
  if (subcommand === 'stash') {
    if (!trimmedArgs) return true; // bare `git stash` without args lists
    return /^(list|show)\b/.test(trimmedArgs);
  }

  return false;
}

export const git = (cwd: string) =>
  tool({
    description:
      'Execute git operations in the project repository. Supports status, diff, log, show, add, commit, checkout, branch, merge, rebase, push, pull, stash, reset, tag, and remote. Read-only operations (status, diff, log, show, branch list, etc.) run without approval; write operations require user confirmation.',
    inputSchema: z.object({
      subcommand: z
        .enum([
          'status',
          'diff',
          'log',
          'show',
          'add',
          'commit',
          'checkout',
          'branch',
          'merge',
          'rebase',
          'push',
          'pull',
          'stash',
          'reset',
          'tag',
          'remote',
        ])
        .describe('The git subcommand to run'),
      args: z
        .union([z.string(), z.null()])
        .describe(
          'Arguments for the subcommand (e.g. "--oneline -5" for log, "-m \\"message\\"" for commit). Null for no args.',
        ),
    }),
    execute: async ({ subcommand, args: rawArgs }) => {
      const args = rawArgs ?? '';
      const command = `git ${subcommand} ${args}`.trim();

      const result = await execAsync(command, { cwd, timeout: DEFAULT_TIMEOUT });

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
        error: result.stderr || `Command failed with exit code ${result.exitCode}`,
      };
    },
  });
