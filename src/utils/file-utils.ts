import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

const MAX_FILE_SIZE = 512 * 1024; // 512KB

export function resolvePath(filePath: string, cwd: string): string {
  if (isAbsolute(filePath)) return filePath;
  return resolve(cwd, filePath);
}

export function readFileSafe(
  filePath: string,
  options?: { startLine?: number; endLine?: number },
): { content: string; totalLines: number; linesRead: [number, number] } {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large (${(stat.size / 1024).toFixed(0)}KB). Maximum: ${MAX_FILE_SIZE / 1024}KB`,
    );
  }

  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');
  const totalLines = lines.length;

  const start = Math.max(1, options?.startLine ?? 1);
  const end = Math.min(totalLines, options?.endLine ?? totalLines);

  const selectedLines = lines.slice(start - 1, end);
  const content = selectedLines
    .map((line: string, i: number) => `${String(start + i).padStart(5)} | ${line}`)
    .join('\n');

  return { content, totalLines, linesRead: [start, end] };
}

export function editFileSafe(
  filePath: string,
  oldText: string,
  newText: string,
): { success: boolean; linesChanged: number } {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf-8');

  const occurrences = raw.split(oldText).length - 1;
  if (occurrences === 0) {
    throw new Error('Old text not found in file. Make sure it matches exactly.');
  }
  if (occurrences > 1) {
    throw new Error(
      `Found ${occurrences} occurrences of old text. Include more surrounding context to make the match unique.`,
    );
  }

  const updated = raw.replace(oldText, newText);
  writeFileSync(filePath, updated, 'utf-8');

  const oldLines = oldText.split('\n').length;
  const newLines = newText.split('\n').length;

  return { success: true, linesChanged: Math.abs(newLines - oldLines) + 1 };
}
