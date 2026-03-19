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
import { git, isGitReadOnly } from './git.js';
import { think } from './think.js';
import { fetchUrl } from './fetch.js';
import { patch } from './patch.js';
import { todoManager } from './todo-manager.js';
import { memory } from './memory.js';
import { execSync } from 'node:child_process';
import { vi } from 'vitest';

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

    expect(result.files!.length).toBeLessThanOrEqual(2);
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
    expect(result.matches!.length).toBeGreaterThanOrEqual(1);
    expect(result.matches![0].content).toContain('hello');
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

// ── git ─────────────────────────────────────────────────────────────────────

describe('git tool', () => {
  const GIT_TMP = join(tmpdir(), `golem-test-git-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(GIT_TMP, { recursive: true });
    execSync('git init', { cwd: GIT_TMP, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: GIT_TMP, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: GIT_TMP, stdio: 'pipe' });
  });

  afterEach(() => {
    rmSync(GIT_TMP, { recursive: true, force: true });
  });

  it('runs git status', async () => {
    const tool = git(GIT_TMP);
    const result = await tool.execute({ subcommand: 'status', args: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('runs git log on a repo with commits', async () => {
    writeFileSync(join(GIT_TMP, 'file.txt'), 'hello', 'utf-8');
    execSync('git add .', { cwd: GIT_TMP, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: GIT_TMP, stdio: 'pipe' });

    const tool = git(GIT_TMP);
    const result = await tool.execute({ subcommand: 'log', args: '--oneline -1' }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('init');
  });

  it('runs git diff', async () => {
    writeFileSync(join(GIT_TMP, 'file.txt'), 'hello', 'utf-8');
    execSync('git add .', { cwd: GIT_TMP, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: GIT_TMP, stdio: 'pipe' });
    writeFileSync(join(GIT_TMP, 'file.txt'), 'hello world', 'utf-8');

    const tool = git(GIT_TMP);
    const result = await tool.execute({ subcommand: 'diff', args: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('hello world');
  });

  it('runs git add and commit', async () => {
    writeFileSync(join(GIT_TMP, 'new.txt'), 'content', 'utf-8');

    const tool = git(GIT_TMP);
    const addResult = await tool.execute({ subcommand: 'add', args: '.' }, { toolCallId: 'test', messages: [] });
    expect(addResult.success).toBe(true);

    const commitResult = await tool.execute({ subcommand: 'commit', args: '-m "test commit"' }, { toolCallId: 'test', messages: [] });
    expect(commitResult.success).toBe(true);
    expect(commitResult.stdout).toContain('test commit');
  });

  it('runs git branch', async () => {
    writeFileSync(join(GIT_TMP, 'file.txt'), 'hello', 'utf-8');
    execSync('git add . && git commit -m "init"', { cwd: GIT_TMP, stdio: 'pipe' });

    const tool = git(GIT_TMP);
    const result = await tool.execute({ subcommand: 'branch', args: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.stdout.includes('main') || result.stdout.includes('master')).toBe(true);
  });

  it('returns error for non-git directory', async () => {
    const nonGitDir = join(tmpdir(), `golem-test-nongit-${Date.now()}`);
    mkdirSync(nonGitDir, { recursive: true });

    try {
      const tool = git(nonGitDir);
      const result = await tool.execute({ subcommand: 'status', args: null }, { toolCallId: 'test', messages: [] });

      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});

// ── isGitReadOnly ───────────────────────────────────────────────────────────

describe('isGitReadOnly', () => {
  it('treats status, diff, log, show, remote as read-only', () => {
    expect(isGitReadOnly('status', null)).toBe(true);
    expect(isGitReadOnly('diff', '--cached')).toBe(true);
    expect(isGitReadOnly('log', '--oneline -5')).toBe(true);
    expect(isGitReadOnly('show', 'HEAD')).toBe(true);
    expect(isGitReadOnly('remote', '-v')).toBe(true);
  });

  it('treats branch with no args or list flags as read-only', () => {
    expect(isGitReadOnly('branch', null)).toBe(true);
    expect(isGitReadOnly('branch', '--list')).toBe(true);
    expect(isGitReadOnly('branch', '-a')).toBe(true);
    expect(isGitReadOnly('branch', '-r')).toBe(true);
  });

  it('treats branch with create/delete args as write', () => {
    expect(isGitReadOnly('branch', 'new-feature')).toBe(false);
    expect(isGitReadOnly('branch', '-d old-branch')).toBe(false);
    expect(isGitReadOnly('branch', '-D old-branch')).toBe(false);
  });

  it('treats stash list/show as read-only', () => {
    expect(isGitReadOnly('stash', null)).toBe(true);
    expect(isGitReadOnly('stash', 'list')).toBe(true);
    expect(isGitReadOnly('stash', 'show stash@{0}')).toBe(true);
  });

  it('treats stash push/pop/drop as write', () => {
    expect(isGitReadOnly('stash', 'push')).toBe(false);
    expect(isGitReadOnly('stash', 'pop')).toBe(false);
    expect(isGitReadOnly('stash', 'drop')).toBe(false);
  });

  it('treats write operations as non-read-only', () => {
    expect(isGitReadOnly('add', '.')).toBe(false);
    expect(isGitReadOnly('commit', '-m "msg"')).toBe(false);
    expect(isGitReadOnly('push', null)).toBe(false);
    expect(isGitReadOnly('pull', null)).toBe(false);
    expect(isGitReadOnly('merge', 'main')).toBe(false);
    expect(isGitReadOnly('rebase', 'main')).toBe(false);
    expect(isGitReadOnly('reset', '--hard')).toBe(false);
    expect(isGitReadOnly('checkout', 'feature')).toBe(false);
    expect(isGitReadOnly('tag', 'v1.0')).toBe(false);
  });
});

// ── think ───────────────────────────────────────────────────────────────────

describe('think tool', () => {
  it('returns the thought as-is', async () => {
    const tool = think();
    const result = await tool.execute({ thought: 'Step 1: Read the file. Step 2: Edit it.' }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.thought).toBe('Step 1: Read the file. Step 2: Edit it.');
  });
});

// ── fetchUrl ────────────────────────────────────────────────────────────────

describe('fetchUrl tool', () => {
  it('fetches a URL successfully', async () => {
    const tool = fetchUrl();
    const result = await tool.execute(
      { url: 'https://httpbin.org/get', method: null, headers: null, body: null, timeout: null },
      { toolCallId: 'test', messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toBeTruthy();
  });

  it('handles POST with body', async () => {
    const tool = fetchUrl();
    const result = await tool.execute(
      {
        url: 'https://httpbin.org/post',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
        timeout: null,
      },
      { toolCallId: 'test', messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
  });

  it('returns error for invalid URL', async () => {
    const tool = fetchUrl();
    const result = await tool.execute(
      { url: 'not-a-url', method: null, headers: null, body: null, timeout: null },
      { toolCallId: 'test', messages: [] },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('handles timeout', async () => {
    const tool = fetchUrl();
    const result = await tool.execute(
      { url: 'https://httpbin.org/delay/10', method: null, headers: null, body: null, timeout: 500 },
      { toolCallId: 'test', messages: [] },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });
});

// ── patch ───────────────────────────────────────────────────────────────────

describe('patch tool', () => {
  it('applies a simple hunk', async () => {
    writeFileSync(join(TMP, 'patch-test.txt'), 'line 1\nline 2\nline 3\n', 'utf-8');

    const diff = [
      '@@ -1,3 +1,3 @@',
      ' line 1',
      '-line 2',
      '+line 2 modified',
      ' line 3',
    ].join('\n');

    const tool = patch(TMP);
    const result = await tool.execute({ filePath: 'patch-test.txt', diff }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.hunksApplied).toBe(1);

    const content = readFileSync(join(TMP, 'patch-test.txt'), 'utf-8');
    expect(content).toContain('line 2 modified');
    expect(content).not.toContain('\nline 2\n');
  });

  it('applies additions', async () => {
    writeFileSync(join(TMP, 'patch-add.txt'), 'a\nb\nc\n', 'utf-8');

    const diff = [
      '@@ -1,3 +1,4 @@',
      ' a',
      '+inserted',
      ' b',
      ' c',
    ].join('\n');

    const tool = patch(TMP);
    const result = await tool.execute({ filePath: 'patch-add.txt', diff }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    const content = readFileSync(join(TMP, 'patch-add.txt'), 'utf-8');
    expect(content).toContain('inserted');
  });

  it('returns error for non-existent file', async () => {
    const tool = patch(TMP);
    const result = await tool.execute({ filePath: 'nope.txt', diff: '@@ -1,1 +1,1 @@\n-a\n+b' }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error for invalid diff', async () => {
    writeFileSync(join(TMP, 'patch-bad.txt'), 'content\n', 'utf-8');

    const tool = patch(TMP);
    const result = await tool.execute({ filePath: 'patch-bad.txt', diff: 'not a diff' }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No valid hunks');
  });
});

// ── todoManager ─────────────────────────────────────────────────────────────

describe('todoManager tool', () => {
  // Use a unique cwd per test to isolate state
  const TODO_CWD = join(TMP, 'todo-test');

  beforeEach(() => mkdirSync(TODO_CWD, { recursive: true }));

  it('adds a task', async () => {
    const tool = todoManager(TODO_CWD);
    const result = await tool.execute(
      { action: 'add', task: 'Fix the bug', id: null, status: null },
      { toolCallId: 'test', messages: [] },
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('Fix the bug');
  });

  it('lists tasks', async () => {
    const tool = todoManager(TODO_CWD + '-list');
    await tool.execute({ action: 'add', task: 'Task A', id: null, status: null }, { toolCallId: 'test', messages: [] });
    await tool.execute({ action: 'add', task: 'Task B', id: null, status: null }, { toolCallId: 'test', messages: [] });

    const result = await tool.execute({ action: 'list', task: null, id: null, status: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    expect(result.tasks).toContain('Task A');
    expect(result.tasks).toContain('Task B');
  });

  it('updates task status', async () => {
    const tool = todoManager(TODO_CWD + '-update');
    const addResult = await tool.execute({ action: 'add', task: 'Do stuff', id: null, status: null }, { toolCallId: 'test', messages: [] });

    // Extract the ID from the message
    const idMatch = (addResult.message as string).match(/#(\d+)/);
    const id = parseInt(idMatch![1], 10);

    const result = await tool.execute({ action: 'update', task: null, id, status: 'done' }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.tasks).toContain('done');
  });

  it('removes a task', async () => {
    const tool = todoManager(TODO_CWD + '-remove');
    const addResult = await tool.execute({ action: 'add', task: 'Temp task', id: null, status: null }, { toolCallId: 'test', messages: [] });

    const idMatch = (addResult.message as string).match(/#(\d+)/);
    const id = parseInt(idMatch![1], 10);

    const result = await tool.execute({ action: 'remove', task: null, id, status: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Removed');
  });

  it('clears all tasks', async () => {
    const tool = todoManager(TODO_CWD + '-clear');
    await tool.execute({ action: 'add', task: 'A', id: null, status: null }, { toolCallId: 'test', messages: [] });
    await tool.execute({ action: 'add', task: 'B', id: null, status: null }, { toolCallId: 'test', messages: [] });

    const result = await tool.execute({ action: 'clear', task: null, id: null, status: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Cleared 2');
  });

  it('returns error for missing task on add', async () => {
    const tool = todoManager(TODO_CWD + '-err');
    const result = await tool.execute({ action: 'add', task: null, id: null, status: null }, { toolCallId: 'test', messages: [] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });
});

// ── memory ──────────────────────────────────────────────────────────────────

describe('memory tool', () => {
  const MEM_CWD = join(TMP, 'memory-test');

  beforeEach(() => mkdirSync(MEM_CWD, { recursive: true }));

  it('stores and retrieves a value', async () => {
    const tool = memory(MEM_CWD);
    const setResult = await tool.execute(
      { action: 'set', key: 'lang', value: 'typescript', scope: 'project' },
      { toolCallId: 'test', messages: [] },
    );
    expect(setResult.success).toBe(true);

    const getResult = await tool.execute(
      { action: 'get', key: 'lang', value: null, scope: 'project' },
      { toolCallId: 'test', messages: [] },
    );
    expect(getResult.success).toBe(true);
    expect(getResult.value).toBe('typescript');
  });

  it('lists all entries', async () => {
    const tool = memory(MEM_CWD + '-list');
    await tool.execute({ action: 'set', key: 'a', value: '1', scope: 'project' }, { toolCallId: 'test', messages: [] });
    await tool.execute({ action: 'set', key: 'b', value: '2', scope: 'project' }, { toolCallId: 'test', messages: [] });

    const result = await tool.execute(
      { action: 'list', key: null, value: null, scope: 'project' },
      { toolCallId: 'test', messages: [] },
    );
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it('deletes an entry', async () => {
    const tool = memory(MEM_CWD + '-del');
    await tool.execute({ action: 'set', key: 'tmp', value: 'val', scope: 'project' }, { toolCallId: 'test', messages: [] });

    const delResult = await tool.execute(
      { action: 'delete', key: 'tmp', value: null, scope: 'project' },
      { toolCallId: 'test', messages: [] },
    );
    expect(delResult.success).toBe(true);

    const getResult = await tool.execute(
      { action: 'get', key: 'tmp', value: null, scope: 'project' },
      { toolCallId: 'test', messages: [] },
    );
    expect(getResult.success).toBe(false);
  });

  it('clears all entries', async () => {
    const tool = memory(MEM_CWD + '-clear');
    await tool.execute({ action: 'set', key: 'x', value: '1', scope: 'project' }, { toolCallId: 'test', messages: [] });
    await tool.execute({ action: 'set', key: 'y', value: '2', scope: 'project' }, { toolCallId: 'test', messages: [] });

    const result = await tool.execute(
      { action: 'clear', key: null, value: null, scope: 'project' },
      { toolCallId: 'test', messages: [] },
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('Cleared 2');
  });

  it('uses global scope when specified', async () => {
    // Stub XDG to use temp dir for global storage
    vi.stubEnv('XDG_CONFIG_HOME', MEM_CWD + '-global');

    const tool = memory(MEM_CWD);
    const setResult = await tool.execute(
      { action: 'set', key: 'theme', value: 'dark', scope: 'global' },
      { toolCallId: 'test', messages: [] },
    );
    expect(setResult.success).toBe(true);
    expect(setResult.scope).toBe('global');

    const getResult = await tool.execute(
      { action: 'get', key: 'theme', value: null, scope: 'global' },
      { toolCallId: 'test', messages: [] },
    );
    expect(getResult.success).toBe(true);
    expect(getResult.value).toBe('dark');

    vi.unstubAllEnvs();
  });

  it('defaults to project scope', async () => {
    const tool = memory(MEM_CWD + '-default');
    const result = await tool.execute(
      { action: 'set', key: 'foo', value: 'bar', scope: null },
      { toolCallId: 'test', messages: [] },
    );
    expect(result.success).toBe(true);
    expect(result.scope).toBe('project');
  });

  it('returns error for get on non-existent key', async () => {
    const tool = memory(MEM_CWD + '-nokey');
    const result = await tool.execute(
      { action: 'get', key: 'nope', value: null, scope: 'project' },
      { toolCallId: 'test', messages: [] },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
