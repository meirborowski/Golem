import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile } from './read-file.js';
import { writeFile } from './write-file.js';
import { editFile } from './edit-file.js';
import { listFiles } from './list-files.js';
import { searchFiles } from './search-files.js';
import { bash } from './bash.js';

const TMP = join(tmpdir(), `golem-test-tools-${Date.now()}`);

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

// ── readFile ────────────────────────────────────────────────────────────────

describe('readFile tool', () => {
  it('reads a file successfully', async () => {
    writeFileSync(join(TMP, 'hello.txt'), 'hello\nworld', 'utf-8');
    const tool = readFile(TMP);
    const result = await tool.execute({ filePath: 'hello.txt', startLine: null, endLine: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.content).toContain('hello');
    expect(result.totalLines).toBe(2);
  });

  it('reads a line range', async () => {
    writeFileSync(join(TMP, 'lines.txt'), 'a\nb\nc\nd\ne', 'utf-8');
    const tool = readFile(TMP);
    const result = await tool.execute({ filePath: 'lines.txt', startLine: 2, endLine: 3 }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.linesRead).toEqual([2, 3]);
  });

  it('returns error for non-existent file', async () => {
    const tool = readFile(TMP);
    const result = await tool.execute({ filePath: 'nope.txt', startLine: null, endLine: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

// ── writeFile ───────────────────────────────────────────────────────────────

describe('writeFile tool', () => {
  it('creates a new file', async () => {
    const tool = writeFile(TMP);
    const result = await tool.execute({ filePath: 'new.txt', content: 'hello world' }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(readFileSync(join(TMP, 'new.txt'), 'utf-8')).toBe('hello world');
  });

  it('creates nested directories', async () => {
    const tool = writeFile(TMP);
    const result = await tool.execute({ filePath: 'deep/nested/file.txt', content: 'deep' }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(existsSync(join(TMP, 'deep', 'nested', 'file.txt'))).toBe(true);
  });

  it('overwrites existing file', async () => {
    writeFileSync(join(TMP, 'existing.txt'), 'old', 'utf-8');
    const tool = writeFile(TMP);
    const result = await tool.execute({ filePath: 'existing.txt', content: 'new' }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(readFileSync(join(TMP, 'existing.txt'), 'utf-8')).toBe('new');
  });
});

// ── editFile ────────────────────────────────────────────────────────────────

describe('editFile tool', () => {
  it('replaces text in a file', async () => {
    writeFileSync(join(TMP, 'edit.txt'), 'const x = 1;\nconst y = 2;', 'utf-8');
    const tool = editFile(TMP);
    const result = await tool.execute({ filePath: 'edit.txt', oldText: 'const x = 1;', newText: 'const x = 42;' }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(readFileSync(join(TMP, 'edit.txt'), 'utf-8')).toContain('const x = 42;');
  });

  it('returns error when text not found', async () => {
    writeFileSync(join(TMP, 'edit2.txt'), 'foo bar', 'utf-8');
    const tool = editFile(TMP);
    const result = await tool.execute({ filePath: 'edit2.txt', oldText: 'baz', newText: 'qux' }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error for ambiguous match', async () => {
    writeFileSync(join(TMP, 'edit3.txt'), 'aaa bbb aaa', 'utf-8');
    const tool = editFile(TMP);
    const result = await tool.execute({ filePath: 'edit3.txt', oldText: 'aaa', newText: 'ccc' }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('occurrences');
  });
});

// ── listFiles ───────────────────────────────────────────────────────────────

describe('listFiles tool', () => {
  it('lists files matching a pattern', async () => {
    writeFileSync(join(TMP, 'a.ts'), '', 'utf-8');
    writeFileSync(join(TMP, 'b.ts'), '', 'utf-8');
    writeFileSync(join(TMP, 'c.js'), '', 'utf-8');
    const tool = listFiles(TMP);
    const result = await tool.execute({ pattern: '*.ts', maxResults: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(2);
    expect(result.files).toContain('a.ts');
    expect(result.files).toContain('b.ts');
  });

  it('respects maxResults', async () => {
    writeFileSync(join(TMP, '1.txt'), '', 'utf-8');
    writeFileSync(join(TMP, '2.txt'), '', 'utf-8');
    writeFileSync(join(TMP, '3.txt'), '', 'utf-8');
    const tool = listFiles(TMP);
    const result = await tool.execute({ pattern: '*.txt', maxResults: 2 }, { toolCallId: 'test', messages: [] });

    expect(result.files.length).toBeLessThanOrEqual(2);
    expect(result.truncated).toBe(true);
  });
});

// ── searchFiles ─────────────────────────────────────────────────────────────

describe('searchFiles tool', () => {
  it('finds matches in files', async () => {
    writeFileSync(join(TMP, 'search.txt'), 'hello world\nfoo bar\nhello again', 'utf-8');
    const tool = searchFiles(TMP);
    const result = await tool.execute(
      { pattern: 'hello', glob: '*.txt', maxResults: null, contextLines: null },
      { toolCallId: 'test', messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches[0].content).toContain('hello');
  });

  it('returns empty for no matches', async () => {
    writeFileSync(join(TMP, 'no-match.txt'), 'nothing here', 'utf-8');
    const tool = searchFiles(TMP);
    const result = await tool.execute(
      { pattern: 'zzzzz', glob: '*.txt', maxResults: null, contextLines: null },
      { toolCallId: 'test', messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.matches).toHaveLength(0);
  });
});

// ── bash ────────────────────────────────────────────────────────────────────

describe('bash tool', () => {
  it('executes a command successfully', async () => {
    const tool = bash(TMP);
    const result = await tool.execute({ command: 'echo hello', timeout: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('hello');
    expect(result.exitCode).toBe(0);
  });

  it('captures stderr and exit code on failure', async () => {
    const tool = bash(TMP);
    const result = await tool.execute({ command: 'node -e "process.exit(1)"', timeout: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });
});
