import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveSession, loadSession, listSessions, getLatestSessionId, exportToMarkdown } from './session.js';
import type { ChatMessage, TokenUsage, ResolvedConfig } from './types.js';

const TMP = join(tmpdir(), `golem-test-session-${Date.now()}`);
const sessionsDir = join(TMP, 'sessions');

// Override the sessions dir by setting XDG_CONFIG_HOME
beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  vi.stubEnv('XDG_CONFIG_HOME', TMP);
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const testMessages: ChatMessage[] = [
  { role: 'user', content: 'hello', timestamp: 1000 },
  { role: 'assistant', content: 'hi there', timestamp: 2000 },
  { role: 'system', content: 'system note', timestamp: 3000 },
];

const testUsage: TokenUsage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };

const testConfig: ResolvedConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  maxTokens: 4096,
  contextWindow: 128000,
  temperature: 0.7,
  debug: false,
  cwd: '/tmp/test',
  providers: {},
};

describe('saveSession', () => {
  it('saves a session and returns it', () => {
    const session = saveSession(testMessages, testUsage, testConfig);

    expect(session.id).toBeTruthy();
    expect(session.provider).toBe('openai');
    expect(session.model).toBe('gpt-4o');
    // System messages are filtered out
    expect(session.messages).toHaveLength(2);
    expect(session.messages.every((m) => m.role !== 'system')).toBe(true);
    expect(session.tokenUsage).toEqual(testUsage);
  });

  it('updates existing session with same ID', () => {
    const first = saveSession(testMessages, testUsage, testConfig);
    const updated = saveSession(
      [...testMessages, { role: 'user' as const, content: 'more', timestamp: 4000 }],
      { promptTokens: 50, completionTokens: 60, totalTokens: 110 },
      testConfig,
      first.id,
    );

    expect(updated.id).toBe(first.id);
    expect(updated.messages).toHaveLength(3); // 2 original (no system) + 1 new
  });
});

describe('loadSession', () => {
  it('loads a saved session by ID', () => {
    const saved = saveSession(testMessages, testUsage, testConfig);
    const loaded = loadSession(saved.id);

    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(saved.id);
    expect(loaded!.messages).toHaveLength(2);
    expect(loaded!.provider).toBe('openai');
  });

  it('returns null for non-existent session', () => {
    expect(loadSession('does-not-exist')).toBeNull();
  });
});

describe('listSessions', () => {
  it('lists saved sessions newest first', () => {
    vi.useFakeTimers();
    saveSession(testMessages, testUsage, testConfig);
    vi.advanceTimersByTime(2000); // Ensure different second in ID
    saveSession(
      [{ role: 'user', content: 'second session', timestamp: 5000 }],
      testUsage,
      testConfig,
    );
    vi.useRealTimers();

    const sessions = listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    // Newest first
    expect(sessions[0].updatedAt).toBeGreaterThan(sessions[1].updatedAt);
  });

  it('returns empty array when no sessions exist', () => {
    // Don't save anything — sessions dir doesn't exist yet
    vi.stubEnv('XDG_CONFIG_HOME', join(TMP, 'empty'));
    expect(listSessions()).toEqual([]);
  });

  it('includes preview from first user message', () => {
    saveSession(testMessages, testUsage, testConfig);
    const sessions = listSessions();
    expect(sessions[0].preview).toContain('hello');
  });
});

describe('getLatestSessionId', () => {
  it('returns the latest session ID', () => {
    vi.useFakeTimers();
    const s1 = saveSession(testMessages, testUsage, testConfig);
    vi.advanceTimersByTime(2000); // Ensure different second in ID
    const s2 = saveSession(
      [{ role: 'user', content: 'newer', timestamp: 9000 }],
      testUsage,
      testConfig,
    );
    vi.useRealTimers();

    const latest = getLatestSessionId();
    expect(latest).toBe(s2.id);
  });

  it('returns null when no sessions', () => {
    vi.stubEnv('XDG_CONFIG_HOME', join(TMP, 'empty2'));
    expect(getLatestSessionId()).toBeNull();
  });
});

describe('exportToMarkdown', () => {
  it('includes header with provider and model', () => {
    const md = exportToMarkdown(testMessages, 'openai', 'gpt-4o');
    expect(md).toContain('# Golem Conversation');
    expect(md).toContain('openai/gpt-4o');
  });

  it('renders user and assistant messages', () => {
    const md = exportToMarkdown(testMessages, 'openai', 'gpt-4o');
    expect(md).toContain('## 🧑 User');
    expect(md).toContain('hello');
    expect(md).toContain('## 🤖 Assistant');
    expect(md).toContain('hi there');
  });

  it('skips system messages', () => {
    const md = exportToMarkdown(testMessages, 'openai', 'gpt-4o');
    expect(md).not.toContain('system note');
  });

  it('renders tool calls with args', () => {
    const messagesWithTools: ChatMessage[] = [
      { role: 'user', content: 'read the file', timestamp: 1000 },
      {
        role: 'assistant',
        content: 'Here is the file:',
        timestamp: 2000,
        toolCalls: [
          {
            id: 'tc1',
            toolName: 'readFile',
            args: { path: '/tmp/test.txt' },
            result: { success: true, content: 'file contents' },
            status: 'completed',
          },
        ],
      },
    ];

    const md = exportToMarkdown(messagesWithTools, 'anthropic', 'claude');
    expect(md).toContain('**Tool: readFile**');
    expect(md).toContain('/tmp/test.txt');
    expect(md).toContain('file contents');
    expect(md).toContain('<details>');
  });

  it('handles tool calls without results', () => {
    const messagesWithPendingTool: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        timestamp: 1000,
        toolCalls: [
          {
            id: 'tc1',
            toolName: 'bash',
            args: { command: 'ls' },
            status: 'running',
          },
        ],
      },
    ];

    const md = exportToMarkdown(messagesWithPendingTool, 'openai', 'gpt-4o');
    expect(md).toContain('**Tool: bash**');
    expect(md).not.toContain('<details>');
  });

  it('returns valid markdown for empty messages', () => {
    const md = exportToMarkdown([], 'openai', 'gpt-4o');
    expect(md).toContain('# Golem Conversation');
    expect(md).not.toContain('## 🧑 User');
  });
});
