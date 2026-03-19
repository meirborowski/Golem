import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectProject } from './detect-project.js';

const TMP = join(tmpdir(), `golem-test-detect-${Date.now()}`);

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('detectProject', () => {
  it('detects a Node.js project from package.json', () => {
    writeFileSync(
      join(TMP, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { react: '^18' } }),
    );

    const result = detectProject(TMP);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('node');
    expect(result!.language).toBe('JavaScript/TypeScript');
    expect(result!.name).toBe('my-app');
    expect(result!.frameworks).toContain('React');
  });

  it('detects Next.js framework', () => {
    writeFileSync(
      join(TMP, 'package.json'),
      JSON.stringify({ name: 'next-app', dependencies: { next: '^14', react: '^18' } }),
    );

    const result = detectProject(TMP);
    expect(result!.frameworks).toContain('Next.js');
    expect(result!.frameworks).toContain('React');
  });

  it('detects Rust project from Cargo.toml', () => {
    writeFileSync(join(TMP, 'Cargo.toml'), '[package]\nname = "my-crate"');

    const result = detectProject(TMP);
    expect(result!.type).toBe('rust');
    expect(result!.language).toBe('Rust');
  });

  it('detects Go project from go.mod', () => {
    writeFileSync(join(TMP, 'go.mod'), 'module example.com/mymod');

    const result = detectProject(TMP);
    expect(result!.type).toBe('go');
    expect(result!.language).toBe('Go');
  });

  it('detects Python project from pyproject.toml', () => {
    writeFileSync(join(TMP, 'pyproject.toml'), '[project]\nname = "my-pkg"');

    const result = detectProject(TMP);
    expect(result!.type).toBe('python');
    expect(result!.language).toBe('Python');
  });

  it('returns null when no manifest found', () => {
    const result = detectProject(TMP);
    expect(result).toBeNull();
  });

  it('handles malformed package.json gracefully', () => {
    writeFileSync(join(TMP, 'package.json'), '{ invalid json }}}');

    const result = detectProject(TMP);
    // Should still detect as node project, but with empty info
    expect(result).not.toBeNull();
    expect(result!.type).toBe('node');
  });
});
