import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import type { AgentContext } from "#core/entities/AgentContext.js";
import { createIgnoreFilter } from "./gitignore.js";

const MAX_FILES = 50;

export function createSearchReplaceTool(fs: IFileSystem, context: AgentContext) {
  const getIgnoreFilter = createIgnoreFilter(fs);

  return tool({
    description:
      "Find and replace a regex pattern across multiple files. Supports capture group references ($1, $2) in the replacement string. Changes are staged for approval, not immediate. Use dryRun to preview matches first.",
    inputSchema: z.object({
      pattern: z.string().describe("Regex pattern to find"),
      replacement: z.string().describe("Replacement string (supports $1, $2 capture groups)"),
      path: z.string().optional().describe("Directory to search in (default: '.')"),
      include: z.string().optional().describe("Glob pattern to include files (e.g. '*.ts', '*.{ts,tsx}')"),
      exclude: z.string().optional().describe("Glob pattern to exclude files"),
      dryRun: z.boolean().optional().describe("If true, report matches without staging changes"),
    }),
    execute: async ({ pattern, replacement, path, include, exclude, dryRun }) => {
      try {
        const searchPath = path ?? ".";
        const filter = await getIgnoreFilter();
        const regex = new RegExp(pattern, "g");

        const entries = await fs.listDirectory(searchPath, true);
        const files = entries.filter((e) => {
          if (e.isDirectory) return false;
          if (filter(e.path, false)) return false;
          if (include && !matchGlob(e.path, include)) return false;
          if (exclude && matchGlob(e.path, exclude)) return false;
          return true;
        });

        const affected: string[] = [];
        let totalReplacements = 0;

        for (const file of files) {
          if (affected.length >= MAX_FILES) break;

          let content: string;
          try {
            content = await fs.readFile(file.path);
          } catch {
            continue;
          }

          regex.lastIndex = 0;
          const matchCount = (content.match(regex) || []).length;
          if (matchCount === 0) continue;

          totalReplacements += matchCount;
          affected.push(`${file.path} (${matchCount} match${matchCount > 1 ? "es" : ""})`);

          if (!dryRun) {
            const newContent = content.replace(new RegExp(pattern, "g"), replacement);
            context.pendingChanges.push({
              filePath: file.path,
              operation: "modify",
              originalContent: content,
              newContent,
            });
          }
        }

        if (affected.length === 0) {
          return `No matches found for pattern "${pattern}" in ${searchPath}`;
        }

        const mode = dryRun ? "Would replace" : "Staged replacements";
        let output = `${mode} in ${affected.length} file${affected.length > 1 ? "s" : ""} (${totalReplacements} total match${totalReplacements > 1 ? "es" : ""}):\n`;
        output += affected.map((f) => `  ${f}`).join("\n");

        if (affected.length >= MAX_FILES) {
          output += `\n\n... reached limit of ${MAX_FILES} files. Use a more specific path or include pattern.`;
        }

        return output;
      } catch (e) {
        return `Error in search-replace: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}

function matchGlob(filePath: string, pattern: string): boolean {
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
