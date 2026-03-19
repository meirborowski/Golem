import { readFile, writeFile, editFile, listFiles, searchFiles, bash } from '../tools/index.js';
import type { ResolvedConfig } from './types.js';

// Use Record<string, unknown> to avoid strict tool type mismatch across different schemas
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolSet = Record<string, any>;

export function createBuiltinTools(config: ResolvedConfig): ToolSet {
  const cwd = config.cwd;

  return {
    readFile: readFile(cwd),
    writeFile: writeFile(cwd),
    editFile: editFile(cwd),
    listFiles: listFiles(cwd),
    searchFiles: searchFiles(cwd),
    bash: bash(cwd),
  };
}
