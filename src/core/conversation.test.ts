import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationEngine } from './conversation.js';
import type { ResolvedConfig, TokenUsage } from './types.js';
import { tmpdir } from 'node:os';

// Fake model — we won't actually call streamText in these tests
const fakeModel = { modelId: 'test', provider: 'test', specificationVersion: 'v1' } as any;
const fakeTools = {} as any;

const config: ResolvedConfig = {
  provider: 'test',
  model: 'test',
  maxTokens: 200,
  contextWindow: 2000,
  temperature: 0.7,
  debug: false,
  cwd: tmpdir(), // Use tmpdir to avoid loading project docs
  providers: {},
};

describe('ConversationEngine', () => {
  let engine: ConversationEngine;

  beforeEach(() => {
    engine = new ConversationEngine(fakeModel, fakeTools, config);
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

  describe('context window truncation', () => {
    it('truncates old messages when context is exceeded', () => {
      // Use a tiny context window
      const smallConfig: ResolvedConfig = { ...config, contextWindow: 600, maxTokens: 100 };
      const smallEngine = new ConversationEngine(fakeModel, fakeTools, smallConfig);

      smallEngine.loadHistory([
        { role: 'user', content: 'A '.repeat(100) },
        { role: 'assistant', content: 'B '.repeat(100) },
        { role: 'user', content: 'C '.repeat(100) },
        { role: 'assistant', content: 'D '.repeat(100) },
      ]);

      // sendMessage triggers truncation — it will fail on streamText but that's ok
      const gen = smallEngine.sendMessage('E '.repeat(50));
      gen.next().catch(() => {});

      const msgs = smallEngine.getMessages();
      // Should have fewer messages than 5 (4 loaded + 1 new)
      expect(msgs.length).toBeLessThan(5);

      // Should contain a truncation note
      const hasNote = msgs.some(
        (m) => typeof m.content === 'string' && m.content.includes('truncated'),
      );
      expect(hasNote).toBe(true);
    });

    it('does not truncate when within limits', () => {
      const bigConfig: ResolvedConfig = { ...config, contextWindow: 100000 };
      const bigEngine = new ConversationEngine(fakeModel, fakeTools, bigConfig);

      bigEngine.loadHistory([
        { role: 'user', content: 'short' },
        { role: 'assistant', content: 'reply' },
      ]);

      const gen = bigEngine.sendMessage('another');
      gen.next().catch(() => {});

      const msgs = bigEngine.getMessages();
      expect(msgs).toHaveLength(3);
      expect(msgs.some((m) => typeof m.content === 'string' && m.content.includes('truncated'))).toBe(false);
    });
  });
});
