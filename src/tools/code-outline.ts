import { tool } from 'ai';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { resolvePath } from '../utils/file-utils.js';

interface Symbol {
  kind: string;
  name: string;
  line: number;
  exported: boolean;
}

type PatternDef = { kind: string; pattern: RegExp; exported?: RegExp };

const TS_PATTERNS: PatternDef[] = [
  { kind: 'function', pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, exported: /^export\s/ },
  { kind: 'class', pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, exported: /^export\s/ },
  { kind: 'interface', pattern: /^(?:export\s+)?interface\s+(\w+)/, exported: /^export\s/ },
  { kind: 'type', pattern: /^(?:export\s+)?type\s+(\w+)\s*[=<]/, exported: /^export\s/ },
  { kind: 'enum', pattern: /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/, exported: /^export\s/ },
  { kind: 'variable', pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/, exported: /^export\s/ },
];

const PYTHON_PATTERNS: PatternDef[] = [
  { kind: 'function', pattern: /^(?:async\s+)?def\s+(\w+)\s*\(/ },
  { kind: 'class', pattern: /^class\s+(\w+)/ },
];

const GO_PATTERNS: PatternDef[] = [
  { kind: 'function', pattern: /^func\s+(\w+)\s*\(/, exported: /^func\s+[A-Z]/ },
  { kind: 'method', pattern: /^func\s+\([^)]+\)\s+(\w+)\s*\(/, exported: /^func\s+\([^)]+\)\s+[A-Z]/ },
  { kind: 'type', pattern: /^type\s+(\w+)\s+(?:struct|interface)/, exported: /^type\s+[A-Z]/ },
];

const RUST_PATTERNS: PatternDef[] = [
  { kind: 'function', pattern: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, exported: /^pub\s/ },
  { kind: 'struct', pattern: /^(?:pub\s+)?struct\s+(\w+)/, exported: /^pub\s/ },
  { kind: 'enum', pattern: /^(?:pub\s+)?enum\s+(\w+)/, exported: /^pub\s/ },
  { kind: 'trait', pattern: /^(?:pub\s+)?trait\s+(\w+)/, exported: /^pub\s/ },
  { kind: 'impl', pattern: /^impl(?:<[^>]*>)?\s+(\w+)/ },
];

const JAVA_PATTERNS: PatternDef[] = [
  { kind: 'class', pattern: /^(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)/, exported: /^public\s/ },
  { kind: 'interface', pattern: /^(?:public\s+)?interface\s+(\w+)/, exported: /^public\s/ },
  { kind: 'enum', pattern: /^(?:public\s+)?enum\s+(\w+)/, exported: /^public\s/ },
  { kind: 'method', pattern: /^(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/, exported: /^public\s/ },
];

const C_PATTERNS: PatternDef[] = [
  { kind: 'function', pattern: /^(?:static\s+)?(?:inline\s+)?(?:const\s+)?(?:\w+[\s*]+)+(\w+)\s*\([^;]*$/ },
  { kind: 'struct', pattern: /^(?:typedef\s+)?struct\s+(\w+)/ },
  { kind: 'enum', pattern: /^(?:typedef\s+)?enum\s+(\w+)/ },
];

const RUBY_PATTERNS: PatternDef[] = [
  { kind: 'class', pattern: /^class\s+(\w+)/ },
  { kind: 'module', pattern: /^module\s+(\w+)/ },
  { kind: 'method', pattern: /^\s*def\s+(?:self\.)?(\w+[?!=]?)/ },
];

const PHP_PATTERNS: PatternDef[] = [
  { kind: 'method', pattern: /^(?:public|private|protected)\s+(?:static\s+)?function\s+(\w+)/, exported: /^public\s/ },
  { kind: 'class', pattern: /^(?:abstract\s+)?(?:final\s+)?class\s+(\w+)/ },
  { kind: 'interface', pattern: /^interface\s+(\w+)/ },
  { kind: 'trait', pattern: /^trait\s+(\w+)/ },
  { kind: 'enum', pattern: /^enum\s+(\w+)/ },
  { kind: 'function', pattern: /^function\s+(\w+)\s*\(/ },
];

const CSHARP_PATTERNS: PatternDef[] = [
  { kind: 'namespace', pattern: /^namespace\s+([\w.]+)/ },
  { kind: 'class', pattern: /^(?:(?:public|private|protected|internal)\s+)?(?:static\s+)?(?:abstract\s+)?(?:sealed\s+)?(?:partial\s+)?class\s+(\w+)/, exported: /^public\s/ },
  { kind: 'interface', pattern: /^(?:(?:public|private|protected|internal)\s+)?interface\s+(\w+)/, exported: /^public\s/ },
  { kind: 'struct', pattern: /^(?:(?:public|private|protected|internal)\s+)?(?:readonly\s+)?struct\s+(\w+)/, exported: /^public\s/ },
  { kind: 'enum', pattern: /^(?:(?:public|private|protected|internal)\s+)?enum\s+(\w+)/, exported: /^public\s/ },
  { kind: 'method', pattern: /^(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:virtual\s+)?(?:override\s+)?(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/, exported: /^public\s/ },
];

const KOTLIN_PATTERNS: PatternDef[] = [
  { kind: 'class', pattern: /^(?:(?:public|private|internal|open|abstract|sealed|data|enum)\s+)*class\s+(\w+)/ },
  { kind: 'interface', pattern: /^(?:(?:public|private|internal|sealed)\s+)*interface\s+(\w+)/ },
  { kind: 'object', pattern: /^(?:(?:public|private|internal)\s+)?object\s+(\w+)/ },
  { kind: 'function', pattern: /^(?:(?:public|private|internal|suspend|inline|operator)\s+)*fun\s+(?:<[^>]*>\s+)?(\w+)/ },
];

const SWIFT_PATTERNS: PatternDef[] = [
  { kind: 'class', pattern: /^(?:(?:public|private|internal|open|final)\s+)*class\s+(\w+)/, exported: /^public\s/ },
  { kind: 'struct', pattern: /^(?:(?:public|private|internal)\s+)*struct\s+(\w+)/, exported: /^public\s/ },
  { kind: 'enum', pattern: /^(?:(?:public|private|internal)\s+)*enum\s+(\w+)/, exported: /^public\s/ },
  { kind: 'protocol', pattern: /^(?:(?:public|private|internal)\s+)*protocol\s+(\w+)/, exported: /^public\s/ },
  { kind: 'function', pattern: /^(?:\s*(?:public|private|internal|static|class|override|mutating)\s+)*func\s+(\w+)/, exported: /public\s/ },
  { kind: 'extension', pattern: /^extension\s+(\w+)/ },
];

const SCALA_PATTERNS: PatternDef[] = [
  { kind: 'class', pattern: /^(?:(?:abstract|sealed|final|case)\s+)*class\s+(\w+)/ },
  { kind: 'object', pattern: /^(?:case\s+)?object\s+(\w+)/ },
  { kind: 'trait', pattern: /^(?:sealed\s+)?trait\s+(\w+)/ },
  { kind: 'function', pattern: /^\s*def\s+(\w+)/ },
];

const DART_PATTERNS: PatternDef[] = [
  { kind: 'class', pattern: /^(?:abstract\s+)?class\s+(\w+)/ },
  { kind: 'mixin', pattern: /^mixin\s+(\w+)/ },
  { kind: 'enum', pattern: /^enum\s+(\w+)/ },
  { kind: 'extension', pattern: /^extension\s+(\w+)/ },
  { kind: 'function', pattern: /^(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/, exported: /^[^_]/ },
];

const LUA_PATTERNS: PatternDef[] = [
  { kind: 'function', pattern: /^(?:local\s+)?function\s+([\w.]+)\s*\(/ },
  { kind: 'function', pattern: /^(?:local\s+)?([\w.]+)\s*=\s*function\s*\(/ },
];

const SHELL_PATTERNS: PatternDef[] = [
  { kind: 'function', pattern: /^(?:function\s+)?(\w+)\s*\(\s*\)/ },
];

const ELIXIR_PATTERNS: PatternDef[] = [
  { kind: 'module', pattern: /^defmodule\s+([\w.]+)/ },
  { kind: 'function', pattern: /^\s*def\s+(\w+[?!]?)/, exported: /^\s*def\s/ },
  { kind: 'function', pattern: /^\s*defp\s+(\w+[?!]?)/ },
  { kind: 'macro', pattern: /^\s*defmacro\s+(\w+[?!]?)/, exported: /^\s*defmacro\s/ },
];

const LANG_MAP: Record<string, PatternDef[]> = {
  '.ts': TS_PATTERNS,
  '.tsx': TS_PATTERNS,
  '.js': TS_PATTERNS,
  '.jsx': TS_PATTERNS,
  '.mjs': TS_PATTERNS,
  '.cjs': TS_PATTERNS,
  '.py': PYTHON_PATTERNS,
  '.go': GO_PATTERNS,
  '.rs': RUST_PATTERNS,
  '.java': JAVA_PATTERNS,
  '.c': C_PATTERNS,
  '.h': C_PATTERNS,
  '.cpp': C_PATTERNS,
  '.hpp': C_PATTERNS,
  '.cc': C_PATTERNS,
  '.rb': RUBY_PATTERNS,
  '.php': PHP_PATTERNS,
  '.cs': CSHARP_PATTERNS,
  '.kt': KOTLIN_PATTERNS,
  '.kts': KOTLIN_PATTERNS,
  '.swift': SWIFT_PATTERNS,
  '.scala': SCALA_PATTERNS,
  '.sc': SCALA_PATTERNS,
  '.dart': DART_PATTERNS,
  '.lua': LUA_PATTERNS,
  '.sh': SHELL_PATTERNS,
  '.bash': SHELL_PATTERNS,
  '.zsh': SHELL_PATTERNS,
  '.ex': ELIXIR_PATTERNS,
  '.exs': ELIXIR_PATTERNS,
};

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (['.ts', '.tsx'].includes(ext)) return 'typescript';
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return 'javascript';
  if (ext === '.py') return 'python';
  if (ext === '.go') return 'go';
  if (ext === '.rs') return 'rust';
  if (ext === '.java') return 'java';
  if (['.c', '.h', '.cpp', '.hpp', '.cc'].includes(ext)) return 'c/c++';
  if (ext === '.rb') return 'ruby';
  if (ext === '.php') return 'php';
  if (ext === '.cs') return 'c#';
  if (['.kt', '.kts'].includes(ext)) return 'kotlin';
  if (ext === '.swift') return 'swift';
  if (['.scala', '.sc'].includes(ext)) return 'scala';
  if (ext === '.dart') return 'dart';
  if (ext === '.lua') return 'lua';
  if (['.sh', '.bash', '.zsh'].includes(ext)) return 'shell';
  if (['.ex', '.exs'].includes(ext)) return 'elixir';
  return 'unknown';
}

export function extractSymbols(content: string, filePath: string): Symbol[] {
  const ext = extname(filePath).toLowerCase();
  const patterns = LANG_MAP[ext];
  if (!patterns) return [];

  const lines = content.split('\n');
  const symbols: Symbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    for (const def of patterns) {
      const match = trimmed.match(def.pattern);
      if (match && match[1]) {
        const exported = def.exported ? def.exported.test(trimmed) : false;
        symbols.push({
          kind: def.kind,
          name: match[1],
          line: i + 1,
          exported,
        });
        break; // Only match first pattern per line
      }
    }
  }

  return symbols;
}

function formatSymbols(symbols: Symbol[], language: string): string {
  if (symbols.length === 0) {
    return `No symbols found (language: ${language})`;
  }

  const lines: string[] = [];
  for (const sym of symbols) {
    const exp = sym.exported ? ' [exported]' : '';
    lines.push(`  L${sym.line}: ${sym.kind} ${sym.name}${exp}`);
  }
  return lines.join('\n');
}

export const codeOutline = (cwd: string) =>
  tool({
    description:
      'Extract an outline of symbols (functions, classes, types, etc.) from a source file with line numbers. Supports TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, Ruby, PHP, C#, Kotlin, Swift, Scala, Dart, Lua, Shell, and Elixir. Use this to understand file structure without reading the entire file.',
    inputSchema: z.object({
      filePath: z.string().describe('Path to the source file (relative to cwd or absolute)'),
    }),
    execute: async ({ filePath }) => {
      try {
        const resolved = resolvePath(filePath, cwd);

        if (!existsSync(resolved)) {
          return { success: false, error: `File not found: ${resolved}` };
        }

        const content = readFileSync(resolved, 'utf-8');
        const language = detectLanguage(resolved);
        const symbols = extractSymbols(content, resolved);

        return {
          success: true,
          filePath: resolved,
          language,
          symbolCount: symbols.length,
          outline: formatSymbols(symbols, language),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
