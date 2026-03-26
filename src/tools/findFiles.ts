import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import { createIgnoreFilter } from "./gitignore.js";

const MAX_RESULTS = 200;

export function createFindFilesTool(fs: IFileSystem) {
  const getIgnoreFilter = createIgnoreFilter(fs);

  return tool({
    description:
      "Find files by name pattern (glob) across a directory tree. Unlike listDirectory, this searches recursively and filters by pattern. Useful for finding all test files, config files, or files matching a name.",
    inputSchema: z.object({
      pattern: z.string().describe("Glob pattern to match file names (e.g. '*.test.ts', 'schema*', '**/*.json')"),
      path: z.string().optional().describe("Directory to search in (default: '.')"),
    }),
    execute: async ({ pattern, path }) => {
      try {
        const searchPath = path ?? ".";
        const filter = await getIgnoreFilter();
        const entries = await fs.listDirectory(searchPath, true);

        const regex = globToRegex(pattern);
        const matches = entries.filter((e) => {
          if (e.isDirectory) return false;
          if (filter(e.path, false)) return false;
          return regex.test(e.path);
        });

        if (matches.length === 0) {
          return `No files matching "${pattern}" found in ${searchPath}`;
        }

        const truncated = matches.length > MAX_RESULTS;
        const displayed = matches.slice(0, MAX_RESULTS);
        let result = displayed.map((e) => e.path).join("\n");

        if (truncated) {
          result += `\n\n... and ${matches.length - MAX_RESULTS} more. Use a more specific pattern.`;
        }

        return `Found ${matches.length} file(s):\n${result}`;
      } catch (e) {
        return `Error finding files: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}

function globToRegex(pattern: string): RegExp {
  // Handle {a,b} alternation
  const expanded = expandBraces(pattern);
  const regexParts = expanded.map((p) => {
    const regexStr = p
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "{{GLOBSTAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/{{GLOBSTAR}}/g, ".*");
    return `(^|/)${regexStr}$`;
  });
  return new RegExp(regexParts.join("|"));
}

function expandBraces(pattern: string): string[] {
  const match = pattern.match(/\{([^}]+)\}/);
  if (!match) return [pattern];
  const alternatives = match[1].split(",");
  return alternatives.map((alt) => pattern.replace(match[0], alt.trim()));
}
