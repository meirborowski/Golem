import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ConversationEngine } from './conversation.js';
import type { ResolvedConfig, TokenUsage } from './types.js';
import type { AgentConfig } from '../agents/agent-types.js';

const streamTextMock = vi.hoisted(() => vi.fn());
const detectProjectMock = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({
  streamText: streamTextMock,
  stepCountIs: vi.fn(() => ({ type: 'stepCountIs' })),
}));

vi.mock('../utils/detect-project.js', () => ({
  detectProject: detectProjectMock,
}));

const makeTempDir = (suffix: string): string => {
  const dir = join(tmpdir(), `golem-conversation-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

// Fake model — we won't actually call a real provider in these tests
const fakeModel = { modelId: 'test', provider: 'test', specificationVersion: 'v1' };
const fakeTools = {};

const config: ResolvedConfig = {
  provider: 'test',
  model: 'test',
  maxTokens: 200,
  contextWindow: 2000,
  temperature: 0.7,
  debug: false,
  cwd: tmpdir(),
  providers: {},
  mcpServers: {},
};

const testAgent: AgentConfig = {
  name: 'test',
  description: 'Test agent',
  sections: {
    identity: 'You are a test assistant.',
    guidelines: '- Be helpful.',
    tools: '- readFile: Read files',
    behavior: 'Answer questions directly.',
  },
  tools: ['readFile'],
  toolMeta: {
    readFile: {
      description: 'Read file contents',
      whenToUse: 'When you need to inspect file contents.',
    },
  },
  maxTurns: 5,
  maxConsecutiveErrors: 3,
  continuationPrompt: 'Continue.',
  stopCondition: 'default',
};

describe('ConversationEngine', () => {
  let engine: ConversationEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    detectProjectMock.mockReturnValue(null);
    engine = new ConversationEngine(fakeModel as never, fakeTools, config, testAgent);
  });

  afterEach(() => {
    // no-op
  });

  describe('initial state', () => {
    it('starts with empty messages', () => {
      expect(engine.getMessages()).toEqual([]);
    });

    it('starts with zero token usage', () => {
      expect(engine.getTokenUsage()).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    });
  });

  describe('loadHistory', () => {
    it('loads messages', () => {
      engine.loadHistory([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ]);

      expect(engine.getMessages()).toHaveLength(2);
    });

    it('loads token usage', () => {
      const usage: TokenUsage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };
      engine.loadHistory([], usage);

      expect(engine.getTokenUsage()).toEqual(usage);
    });

    it('returns copies, not references', () => {
      engine.loadHistory([{ role: 'user', content: 'hi' }]);
      const msgs = engine.getMessages();
      msgs.push({ role: 'assistant', content: 'injected' });

      expect(engine.getMessages()).toHaveLength(1);
    });
  });

  describe('clearHistory', () => {
    it('clears messages and usage', () => {
      engine.loadHistory(
        [{ role: 'user', content: 'hi' }],
        { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      );
      engine.clearHistory();

      expect(engine.getMessages()).toEqual([]);
      expect(engine.getTokenUsage()).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    });
  });

  describe('setModel', () => {
    it('swaps the model while preserving history', () => {
      engine.loadHistory([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ]);

      const newModel = { modelId: 'new-model', provider: 'test2', specificationVersion: 'v1' };
      engine.setModel(newModel as never);

      expect(engine.getMessages()).toHaveLength(2);
      expect(engine.getTokenUsage()).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    });
  });

  describe('sendMessage', () => {
    it('streams text, stores response messages, and accumulates token usage', async () => {
      streamTextMock.mockReturnValue({
        fullStream: (async function* () {
          yield { type: 'text-delta', text: 'Hello' };
          yield { type: 'finish', totalUsage: { inputTokens: 12, outputTokens: 34, totalTokens: 46 } };
        })(),
        response: Promise.resolve({
          messages: [{ role: 'assistant', content: 'Hello world' }],
        }),
      });

      const events = engine.sendMessage('hi');
      await expect(events.next()).resolves.toMatchObject({
        value: { type: 'text-delta', text: 'Hello' },
        done: false,
      });
      await expect(events.next()).resolves.toMatchObject({
        value: { type: 'finish', usage: { promptTokens: 12, completionTokens: 34, totalTokens: 46 } },
        done: false,
      });
      await expect(events.next()).resolves.toMatchObject({ done: true });

      expect(engine.getMessages()).toEqual([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'Hello world' },
      ]);
      expect(engine.getTokenUsage()).toEqual({
        promptTokens: 12,
        completionTokens: 34,
        totalTokens: 46,
      });
      expect(streamTextMock).toHaveBeenCalledTimes(1);
    });

    it('converts stream errors into error events', async () => {
      streamTextMock.mockReturnValue({
        fullStream: (async function* () {
          yield { type: 'error', error: 'boom' };
        })(),
        response: Promise.resolve({ messages: [] }),
      });

      const events = engine.sendMessage('hi');
      await expect(events.next()).resolves.toMatchObject({
        value: { type: 'error', error: expect.any(Error) },
        done: false,
      });
      await expect(events.next()).resolves.toMatchObject({
        value: { type: 'finish', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
        done: false,
      });
    });
  });

  describe('system prompt construction', () => {
    it('includes project info, docs, and remembered context', async () => {
      const cwd = makeTempDir('system-prompt');
      writeFileSync(
        join(cwd, 'GOLEM.md'),
        'Project instructions from GOLEM.md\nThis content should be included.',
        'utf-8',
      );
      mkdirSync(join(cwd, '.golem'), { recursive: true });
      writeFileSync(join(cwd, '.golem', 'memory.json'), JSON.stringify({ style: 'be concise' }), 'utf-8');

      detectProjectMock.mockReturnValue({
        type: 'node',
        language: 'JavaScript/TypeScript',
        name: 'demo-app',
        frameworks: ['React'],
      });

      const promptConfig: ResolvedConfig = { ...config, cwd };
      const promptEngine = new ConversationEngine(fakeModel as never, fakeTools, promptConfig, testAgent);

      streamTextMock.mockReturnValue({
        fullStream: (async function* () {
          yield { type: 'finish', totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
        })(),
        response: Promise.resolve({ messages: [] }),
      });

      const gen = promptEngine.sendMessage('hello');
      await gen.next();
      await gen.next();

      const systemArg = streamTextMock.mock.calls[0]?.[0]?.system as string | undefined;
      expect(systemArg).toContain('Type: node (JavaScript/TypeScript)');
      expect(systemArg).toContain('Name: demo-app');
      expect(systemArg).toContain('Frameworks: React');
      expect(systemArg).toContain('## Project Documentation (from GOLEM.md)');
      expect(systemArg).toContain('Project instructions from GOLEM.md');
      expect(systemArg).toContain('## Remembered Context');
      expect(systemArg).toContain('style: be concise');

      rmSync(cwd, { recursive: true, force: true });
    });
  });

  describe('context window truncation', () => {
    it('truncates old messages when context is exceeded', async () => {
      const smallConfig: ResolvedConfig = { ...config, contextWindow: 2000, maxTokens: 100 };
      const smallEngine = new ConversationEngine(fakeModel as never, fakeTools, smallConfig, testAgent);

      smallEngine.loadHistory([
        { role: 'user', content: 'A '.repeat(2000) },
        { role: 'assistant', content: 'B '.repeat(2000) },
        { role: 'user', content: 'C '.repeat(2000) },
        { role: 'assistant', content: 'D '.repeat(2000) },
      ]);

      streamTextMock.mockReturnValue({
        fullStream: (async function* () {
          yield { type: 'finish', totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
        })(),
        response: Promise.resolve({ messages: [] }),
      });

      const gen = smallEngine.sendMessage('E '.repeat(500));
      await gen.next();
      await gen.next();

      const msgs = smallEngine.getMessages();
      expect(msgs.length).toBeLessThan(5);
      expect(msgs.some((m) => typeof m.content === 'string' && m.content.includes('truncated'))).toBe(true);
    });

    it('does not truncate when within limits', async () => {
      const bigConfig: ResolvedConfig = { ...config, contextWindow: 100000 };
      const bigEngine = new ConversationEngine(fakeModel as never, fakeTools, bigConfig, testAgent);

      bigEngine.loadHistory([
        { role: 'user', content: 'short' },
        { role: 'assistant', content: 'reply' },
      ]);

      streamTextMock.mockReturnValue({
        fullStream: (async function* () {
          yield { type: 'finish', totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
        })(),
        response: Promise.resolve({ messages: [] }),
      });

      const gen = bigEngine.sendMessage('another');
      await gen.next();
      await gen.next();

      const msgs = bigEngine.getMessages();
      expect(msgs).toHaveLength(3);
      expect(msgs.some((m) => typeof m.content === 'string' && m.content.includes('truncated'))).toBe(false);
    });
  });
});
