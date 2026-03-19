import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolvePath, readFileSafe, editFileSafe } from './file-utils.js';

const TMP = join(tmpdir(), `golem-test-fileutils-${Date.now()}`);

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

// ── resolvePath ─────────────────────────────────────────────────────────────

describe('resolvePath', () => {
  it('returns absolute paths unchanged', () => {
    const abs = join(TMP, 'foo.ts');
    expect(resolvePath(abs, '/some/cwd')).toBe(abs);
  });

  it('resolves relative paths against cwd', () => {
    const result = resolvePath('src/foo.ts', TMP);
    expect(result).toBe(join(TMP, 'src', 'foo.ts'));
  });
});

// ── readFileSafe ────────────────────────────────────────────────────────────

describe('readFileSafe', () => {
  it('reads entire file with line numbers', () => {
    const filePath = join(TMP, 'test.txt');
    writeFileSync(filePath, 'line1\nline2\nline3', 'utf-8');

    const result = readFileSafe(filePath);
    expect(result.totalLines).toBe(3);
    expect(result.linesRead).toEqual([1, 3]);
    expect(result.content).toContain('line1');
    expect(result.content).toContain('line3');
  });

  it('reads a line range', () => {
    const filePath = join(TMP, 'range.txt');
    writeFileSync(filePath, 'a\nb\nc\nd\ne', 'utf-8');

    const result = readFileSafe(filePath, { startLine: 2, endLine: 4 });
    expect(result.linesRead).toEqual([2, 4]);
    expect(result.content).toContain('b');
    expect(result.content).toContain('d');
    expect(result.content).not.toContain('| a');
    expect(result.content).not.toContain('| e');
  });

  it('clamps out-of-range lines', () => {
    const filePath = join(TMP, 'clamp.txt');
    writeFileSync(filePath, 'only\ntwo', 'utf-8');

    const result = readFileSafe(filePath, { startLine: 0, endLine: 100 });
    expect(result.linesRead).toEqual([1, 2]);
  });

  it('throws for non-existent file', () => {
    expect(() => readFileSafe(join(TMP, 'nope.txt'))).toThrow('File not found');
  });

  it('throws for files exceeding size limit', () => {
    const filePath = join(TMP, 'big.txt');
    writeFileSync(filePath, 'x'.repeat(600 * 1024), 'utf-8');
    expect(() => readFileSafe(filePath)).toThrow('File too large');
  });
});

// ── editFileSafe ────────────────────────────────────────────────────────────

describe('editFileSafe', () => {
  it('replaces text successfully', () => {
    const filePath = join(TMP, 'edit.txt');
    writeFileSync(filePath, 'hello world', 'utf-8');

    const result = editFileSafe(filePath, 'hello', 'goodbye');
    expect(result.success).toBe(true);

    const { content } = readFileSafe(filePath);
    expect(content).toContain('goodbye world');
  });

  it('throws when old text not found', () => {
    const filePath = join(TMP, 'edit2.txt');
    writeFileSync(filePath, 'foo bar', 'utf-8');

    expect(() => editFileSafe(filePath, 'baz', 'qux')).toThrow('not found');
  });

  it('throws when multiple occurrences found', () => {
    const filePath = join(TMP, 'edit3.txt');
    writeFileSync(filePath, 'aaa bbb aaa', 'utf-8');

    expect(() => editFileSafe(filePath, 'aaa', 'ccc')).toThrow('2 occurrences');
  });

  it('handles multi-line replacements', () => {
    const filePath = join(TMP, 'multiline.txt');
    writeFileSync(filePath, 'line1\nline2\nline3', 'utf-8');

    const result = editFileSafe(filePath, 'line2', 'new2\nnew3');
    expect(result.linesChanged).toBe(2); // abs(2-1) + 1
  });

  it('throws for non-existent file', () => {
    expect(() => editFileSafe(join(TMP, 'nope.txt'), 'a', 'b')).toThrow('File not found');
  });
});
