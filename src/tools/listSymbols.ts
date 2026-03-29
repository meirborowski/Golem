import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";

const MAX_SYMBOLS = 200;
const MAX_LINE_LENGTH = 80;

interface SymbolPattern {
  kind: string;
  regex: RegExp;
}

const JS_TS_PATTERNS: SymbolPattern[] = [
  { kind: "function", regex: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/ },
  { kind: "class", regex: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/ },
  { kind: "interface", regex: /^\s*(?:export\s+)?interface\s+(\w+)/ },
  { kind: "type", regex: /^\s*(?:export\s+)?type\s+(\w+)\s*[=<]/ },
  { kind: "enum", regex: /^\s*(?:export\s+)?enum\s+(\w+)/ },
  { kind: "const", regex: /^\s*(?:export\s+)?const\s+(\w+)/ },
  { kind: "let", regex: /^\s*(?:export\s+)?let\s+(\w+)/ },
  { kind: "var", regex: /^\s*(?:export\s+)?var\s+(\w+)/ },
];

const PYTHON_PATTERNS: SymbolPattern[] = [
  { kind: "function", regex: /^(?:async\s+)?def\s+(\w+)/ },
  { kind: "class", regex: /^class\s+(\w+)/ },
];

const GO_PATTERNS: SymbolPattern[] = [
  { kind: "function", regex: /^func\s+(\w+)/ },
  { kind: "type", regex: /^type\s+(\w+)/ },
  { kind: "var", regex: /^var\s+(\w+)/ },
  { kind: "const", regex: /^const\s+(\w+)/ },
];

const RUST_PATTERNS: SymbolPattern[] = [
  { kind: "function", regex: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/ },
  { kind: "struct", regex: /^\s*(?:pub\s+)?struct\s+(\w+)/ },
  { kind: "enum", regex: /^\s*(?:pub\s+)?enum\s+(\w+)/ },
  { kind: "trait", regex: /^\s*(?:pub\s+)?trait\s+(\w+)/ },
  { kind: "type", regex: /^\s*(?:pub\s+)?type\s+(\w+)/ },
  { kind: "const", regex: /^\s*(?:pub\s+)?const\s+(\w+)/ },
  { kind: "static", regex: /^\s*(?:pub\s+)?static\s+(\w+)/ },
];

function getPatternsForFile(path: string): SymbolPattern[] {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts": case "tsx": case "js": case "jsx": case "mts": case "mjs": case "cts": case "cjs":
      return JS_TS_PATTERNS;
    case "py":
      return PYTHON_PATTERNS;
    case "go":
      return GO_PATTERNS;
    case "rs":
      return RUST_PATTERNS;
    default:
      return JS_TS_PATTERNS;
  }
}

function truncate(line: string): string {
  return line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH - 1) + "…" : line;
}

export function createListSymbolsTool(fs: IFileSystem) {
  return tool({
    description:
      "List all top-level symbols (functions, classes, interfaces, types, constants) in a file. " +
      "Returns symbol names with line numbers and kind. Much cheaper than readFile for understanding file structure.",
    inputSchema: z.object({
      path: z.string().describe("File path to list symbols from"),
    }),
    execute: async ({ path }) => {
      try {
        const content = await fs.readFile(path);
        const lines = content.split("\n");
        const patterns = getPatternsForFile(path);
        const symbols: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          if (symbols.length >= MAX_SYMBOLS) break;
          const line = lines[i];

          for (const { kind, regex } of patterns) {
            const match = line.match(regex);
            if (match) {
              const lineNum = String(i + 1).padStart(4);
              const kindPad = kind.padEnd(9);
              symbols.push(`${lineNum}: ${kindPad} ${truncate(line.trim())}`);
              break;
            }
          }
        }

        if (symbols.length === 0) {
          return `No symbols found in ${path}`;
        }

        const header = `Symbols in ${path} (${symbols.length}${symbols.length >= MAX_SYMBOLS ? "+, truncated" : ""}):\n`;
        return header + "\n" + symbols.join("\n");
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
