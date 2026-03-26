import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import { createIgnoreFilter } from "./gitignore.js";

const MAX_RESULTS = 50;
const MAX_LINE_LENGTH = 500;

export function createSearchFilesTool(fs: IFileSystem) {
  const getIgnoreFilter = createIgnoreFilter(fs);

  return tool({
    description:
      "Search for a regex pattern across files in a directory. Returns matching lines with file paths and line numbers. Essential for finding where code is defined or used.",
    inputSchema: z.object({
      pattern: z.string().describe("Regex pattern to search for"),
      path: z.string().optional().describe("Directory to search in (default: '.')"),
      include: z.string().optional().describe("Glob pattern to include files (e.g. '*.ts', '*.{ts,tsx}')"),
      exclude: z.string().optional().describe("Glob pattern to exclude files"),
      maxResults: z.number().optional().describe(`Max results to return (default: ${MAX_RESULTS})`),
    }),
    execute: async ({ pattern, path, include, exclude, maxResults }) => {
      try {
        const searchPath = path ?? ".";
        const limit = maxResults ?? MAX_RESULTS;
        const filter = await getIgnoreFilter();
        const regex = new RegExp(pattern, "gi");

        const entries = await fs.listDirectory(searchPath, true);
        const files = entries.filter((e) => {
          if (e.isDirectory) return false;
          if (filter(e.path, false)) return false;
          if (include && !matchGlob(e.path, include)) return false;
          if (exclude && matchGlob(e.path, exclude)) return false;
          return true;
        });

        const results: string[] = [];
        let totalMatches = 0;

        for (const file of files) {
          if (totalMatches >= limit) break;

          let content: string;
          try {
            content = await fs.readFile(file.path);
          } catch {
            continue;
          }

          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (totalMatches >= limit) break;
            regex.lastIndex = 0;
            if (regex.test(lines[i])) {
              const line = lines[i].length > MAX_LINE_LENGTH
                ? lines[i].slice(0, MAX_LINE_LENGTH) + "..."
                : lines[i];
              results.push(`${file.path}:${i + 1}: ${line}`);
              totalMatches++;
            }
          }
        }

        if (results.length === 0) {
          return `No matches found for pattern "${pattern}" in ${searchPath}`;
        }

        let output = results.join("\n");
        if (totalMatches >= limit) {
          output += `\n\n... reached limit of ${limit} results. Use a more specific pattern or path.`;
        }
        return output;
      } catch (e) {
        return `Error searching: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}

function matchGlob(filePath: string, pattern: string): boolean {
  // Handle {ts,tsx} style alternation
  const expanded = expandBraces(pattern);
  return expanded.some((p) => {
    const regex = globToRegex(p);
    return regex.test(filePath);
  });
}

function expandBraces(pattern: string): string[] {
  const match = pattern.match(/\{([^}]+)\}/);
  if (!match) return [pattern];
  const alternatives = match[1].split(",");
  return alternatives.map((alt) => pattern.replace(match[0], alt.trim()));
}

function globToRegex(pattern: string): RegExp {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/{{GLOBSTAR}}/g, ".*");
  return new RegExp(`(^|/)${regexStr}$`);
}
