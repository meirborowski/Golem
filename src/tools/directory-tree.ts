import { tool } from 'ai';
import { z } from 'zod';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface TreeState {
  count: number;
  truncated: boolean;
}

function shouldIgnore(name: string, ignorePatterns: string[]): boolean {
  return ignorePatterns.some((pattern) => {
    // Simple name match (no slashes = match against basename)
    if (!pattern.includes('/')) {
      return name === pattern;
    }
    return false;
  });
}

function buildTree(
  dirPath: string,
  prefix: string,
  depth: number,
  maxDepth: number,
  includeFiles: boolean,
  maxEntries: number,
  ignorePatterns: string[],
  state: TreeState,
): string {
  if (state.count >= maxEntries) {
    if (!state.truncated) {
      state.truncated = true;
    }
    return '';
  }

  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return '';
  }

  // Sort: directories first, then files, alphabetical within each group
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  // Filter out ignored entries and files if not included
  const filtered = entries.filter((entry) => {
    if (shouldIgnore(entry.name, ignorePatterns)) return false;
    if (!includeFiles && !entry.isDirectory()) return false;
    return true;
  });

  let result = '';

  for (let i = 0; i < filtered.length; i++) {
    if (state.count >= maxEntries) {
      state.truncated = true;
      break;
    }

    const entry = filtered[i];
    const isLast = i === filtered.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    state.count++;
    result += `${prefix}${connector}${entry.name}${entry.isDirectory() ? '/' : ''}\n`;

    if (entry.isDirectory() && depth < maxDepth) {
      result += buildTree(
        join(dirPath, entry.name),
        prefix + childPrefix,
        depth + 1,
        maxDepth,
        includeFiles,
        maxEntries,
        ignorePatterns,
        state,
      );
    }
  }

  return result;
}

export const directoryTree = (cwd: string) =>
  tool({
    description:
      'Show a tree view of a directory structure. Useful for understanding project layout and file organization.',
    inputSchema: z.object({
      path: z.string().describe('Relative directory path to tree, e.g. "src" or "."'),
      maxDepth: z
        .union([z.number(), z.null()])
        .describe('Maximum recursion depth. Null defaults to 12.'),
      includeFiles: z
        .union([z.boolean(), z.null()])
        .describe('Whether to include files or show only directories. Null defaults to true.'),
      maxEntries: z
        .union([z.number(), z.null()])
        .describe('Maximum total entries to display. Null defaults to 200.'),
    }),
    execute: async ({ path: relPath, maxDepth: rawDepth, includeFiles: rawFiles, maxEntries: rawMax }) => {
      const maxDepth = rawDepth ?? 12;
      const includeFiles = rawFiles ?? true;
      const maxEntries = rawMax ?? 200;

      try {
        const targetPath = resolve(cwd, relPath);

        if (!existsSync(targetPath)) {
          return { success: false, error: `Directory not found: ${relPath}` };
        }

        // Load .gitignore patterns if present
        const gitignorePath = join(cwd, '.gitignore');
        const ignorePatterns: string[] = ['node_modules', '.git', 'dist'];
        if (existsSync(gitignorePath)) {
          const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
          ignorePatterns.push(
            ...gitignoreContent
              .split('\n')
              .map((l: string) => l.trim())
              .filter((l: string) => l && !l.startsWith('#')),
          );
        }

        const state: TreeState = { count: 0, truncated: false };
        let tree = `${relPath}/\n`;
        tree += buildTree(targetPath, '', 0, maxDepth, includeFiles, maxEntries, ignorePatterns, state);

        if (state.truncated) {
          tree += `[truncated — ${maxEntries} entries limit reached]\n`;
        }

        return {
          success: true,
          tree,
          totalEntries: state.count,
          truncated: state.truncated,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
