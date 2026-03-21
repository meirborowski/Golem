import { tool } from 'ai';
import { z } from 'zod';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolvePath } from '../utils/file-utils.js';
import { unifiedDiff } from '../utils/diff.js';

const MAX_FILE_SIZE = 512 * 1024; // 512KB

function readFileChecked(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const stat = statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large (${(stat.size / 1024).toFixed(0)}KB). Maximum: ${MAX_FILE_SIZE / 1024}KB`,
    );
  }
  return readFileSync(filePath, 'utf-8');
}

function getGitHeadContent(filePath: string, cwd: string): string {
  try {
    return execSync(`git show HEAD:"${filePath}"`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(`Cannot read HEAD version of ${filePath}. Is the file tracked by git?`);
  }
}

export const diffFiles = (cwd: string) =>
  tool({
    description:
      'Compare two files, a file against its git HEAD version, or two raw text strings. Returns a unified diff with change statistics.',
    parameters: z.object({
      filePath1: z
        .union([z.string(), z.null()])
        .default(null)
        .describe('Path to the first file (for file comparison or git HEAD mode)'),
      filePath2: z
        .union([z.string(), z.null()])
        .default(null)
        .describe('Path to the second file (for two-file comparison)'),
      content1: z
        .union([z.string(), z.null()])
        .default(null)
        .describe('First raw text string (for string diff mode)'),
      content2: z
        .union([z.string(), z.null()])
        .default(null)
        .describe('Second raw text string (for string diff mode)'),
      useGitHead: z
        .union([z.boolean(), z.null()])
        .default(null)
        .describe('Compare filePath1 against its last committed (HEAD) version. Null defaults to false.'),
      contextLines: z
        .union([z.number(), z.null()])
        .default(null)
        .describe('Number of context lines around changes. Null defaults to 3.'),
      ignoreWhitespace: z
        .union([z.boolean(), z.null()])
        .default(null)
        .describe('Ignore trailing whitespace differences. Null defaults to false.'),
    }),
    execute: async ({
      filePath1: rawPath1,
      filePath2: rawPath2,
      content1,
      content2,
      useGitHead: rawGitHead,
      contextLines: rawContext,
      ignoreWhitespace: rawIgnoreWs,
    }) => {
      const context = rawContext ?? 3;
      const ignoreWhitespace = rawIgnoreWs ?? false;
      const useGitHead = rawGitHead ?? false;

      try {
        let textA: string;
        let textB: string;
        let labelA: string;
        let labelB: string;

        if (content1 !== null && content2 !== null) {
          // String diff mode
          textA = content1;
          textB = content2;
          labelA = 'a (provided text)';
          labelB = 'b (provided text)';
        } else if (rawPath1 !== null && useGitHead) {
          // Git HEAD diff mode
          const resolved = resolvePath(rawPath1, cwd);
          textB = readFileChecked(resolved);
          textA = getGitHeadContent(rawPath1, cwd);
          labelA = `a/${rawPath1} (HEAD)`;
          labelB = `b/${rawPath1} (working)`;
        } else if (rawPath1 !== null && rawPath2 !== null) {
          // Two-file diff mode
          const resolved1 = resolvePath(rawPath1, cwd);
          const resolved2 = resolvePath(rawPath2, cwd);
          textA = readFileChecked(resolved1);
          textB = readFileChecked(resolved2);
          labelA = `a/${rawPath1}`;
          labelB = `b/${rawPath2}`;
        } else {
          return {
            success: false,
            error:
              'Invalid arguments. Use one of: (1) filePath1 + filePath2 to compare two files, (2) filePath1 + useGitHead to diff against HEAD, (3) content1 + content2 to diff raw strings.',
          };
        }

        const result = unifiedDiff(textA, textB, labelA, labelB, context, ignoreWhitespace);

        return {
          success: true as const,
          diff: result.diff,
          linesAdded: result.linesAdded,
          linesRemoved: result.linesRemoved,
          identical: result.identical,
          error: undefined,
        };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : String(error),
          diff: undefined,
          linesAdded: undefined,
          linesRemoved: undefined,
          identical: undefined,
        };
      }
    },
  });
