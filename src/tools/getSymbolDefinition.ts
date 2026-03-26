import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import { createIgnoreFilter } from "./gitignore.js";

const MAX_CONTEXT_LINES = 10;
const MAX_RESULTS = 20;

// Patterns that typically indicate a symbol definition
const DEFINITION_PATTERNS = [
  // function/class/interface/type/enum declarations
  (sym: string) => new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${esc(sym)}\\b`, "m"),
  (sym: string) => new RegExp(`^\\s*(?:export\\s+)?(?:abstract\\s+)?class\\s+${esc(sym)}\\b`, "m"),
  (sym: string) => new RegExp(`^\\s*(?:export\\s+)?interface\\s+${esc(sym)}\\b`, "m"),
  (sym: string) => new RegExp(`^\\s*(?:export\\s+)?type\\s+${esc(sym)}\\s*[=<]`, "m"),
  (sym: string) => new RegExp(`^\\s*(?:export\\s+)?enum\\s+${esc(sym)}\\b`, "m"),
  // const/let/var declarations
  (sym: string) => new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${esc(sym)}\\b`, "m"),
  // method definitions (in classes)
  (sym: string) => new RegExp(`^\\s*(?:async\\s+)?${esc(sym)}\\s*\\(`, "m"),
  // Python: def/class
  (sym: string) => new RegExp(`^\\s*(?:async\\s+)?def\\s+${esc(sym)}\\b`, "m"),
  (sym: string) => new RegExp(`^\\s*class\\s+${esc(sym)}\\b`, "m"),
];

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createGetSymbolDefinitionTool(fs: IFileSystem) {
  const getIgnoreFilter = createIgnoreFilter(fs);

  return tool({
    description:
      "Find where a function, class, type, or variable is defined. Searches for definition patterns (not just usage). Faster than searchFiles for navigation.",
    inputSchema: z.object({
      symbol: z.string().describe("Symbol name to find the definition of"),
      path: z.string().optional().describe("Directory to search in (default: '.')"),
    }),
    execute: async ({ symbol, path }) => {
      try {
        const searchPath = path ?? ".";
        const filter = await getIgnoreFilter();
        const entries = await fs.listDirectory(searchPath, true);
        const files = entries.filter((e) => !e.isDirectory && !filter(e.path, false));

        const results: string[] = [];

        for (const file of files) {
          if (results.length >= MAX_RESULTS) break;

          let content: string;
          try {
            content = await fs.readFile(file.path);
          } catch {
            continue;
          }

          const lines = content.split("\n");

          for (const makePattern of DEFINITION_PATTERNS) {
            if (results.length >= MAX_RESULTS) break;
            const regex = makePattern(symbol);

            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                const start = Math.max(0, i - 1);
                const end = Math.min(lines.length, i + MAX_CONTEXT_LINES);
                const context = lines.slice(start, end)
                  .map((l, idx) => `${start + idx + 1}: ${l}`)
                  .join("\n");
                results.push(`${file.path}:${i + 1}\n${context}`);
                break; // One match per pattern per file is enough
              }
            }
          }
        }

        if (results.length === 0) {
          return `No definition found for "${symbol}" in ${searchPath}`;
        }

        return `Found ${results.length} definition(s) for "${symbol}":\n\n${results.join("\n\n---\n\n")}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
