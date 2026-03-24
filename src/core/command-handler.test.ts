import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleCommand, getErrorHint, type CommandContext } from './command-handler.js';
import { ExtensionRegistry } from './extension-registry.js';
import { builtinCommandsExtension } from '../extensions/builtin-commands.js';
import { builtinProvidersExtension } from '../extensions/builtin-providers.js';
import { initProviders } from './provider-registry.js';
import type { ChatMessage, TokenUsage, ResolvedConfig } from './types.js';

const TMP = join(tmpdir(), `golem-test-cmd-${Date.now()}`);

let registry: ExtensionRegistry;

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  vi.stubEnv('XDG_CONFIG_HOME', TMP);
  registry = new ExtensionRegistry();
  registry.register(builtinProvidersExtension);
  registry.register(builtinCommandsExtension);
  initProviders(registry);
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const testMessages: ChatMessage[] = [
  { role: 'user', content: 'hello', timestamp: 1000 },
  { role: 'assistant', content: 'hi there', timestamp: 2000 },
];

const testUsage: TokenUsage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };

const testConfig: ResolvedConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  maxTokens: 4096,
  contextWindow: 128000,
  temperature: 0.7,
  debug: false,
  cwd: TMP,
  providers: {},
  mcpServers: {},
};

function makeContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    messages: testMessages,
    tokenUsage: testUsage,
    config: testConfig,
    currentSessionId: null,
    activeProvider: 'openai',
    activeModelName: 'gpt-4o',
    agentName: 'default',
    agentDescription: 'General-purpose coding assistant',
    ...overrides,
  };
}

describe('handleCommand', () => {
  it('returns not-a-command for non-slash input', () => {
    const result = handleCommand('hello world', makeContext(), registry);
    expect(result.type).toBe('not-a-command');
  });

  it('handles /help', () => {
    const result = handleCommand('/help', makeContext(), registry);
    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.content).toContain('Available commands');
      expect(result.content).toContain('/help');
    }
  });

  it('handles /clear', () => {
    const result = handleCommand('/clear', makeContext(), registry);
    expect(result).toEqual({ type: 'clear' });
  });

  it('handles /exit', () => {
    const result = handleCommand('/exit', makeContext(), registry);
    expect(result.type).toBe('exit');
  });

  it('handles /quit', () => {
    const result = handleCommand('/quit', makeContext(), registry);
    expect(result.type).toBe('exit');
  });

  it('handles /model without arg (show current)', () => {
    const result = handleCommand('/model', makeContext(), registry);
    expect(result).toEqual({ type: 'message', content: 'Current model: openai/gpt-4o' });
  });

  it('handles /model with model name', () => {
    const result = handleCommand('/model gpt-4', makeContext(), registry);
    expect(result).toEqual({
      type: 'model-switched',
      provider: 'openai',
      model: 'gpt-4',
      content: 'Switched to openai/gpt-4',
    });
  });

  it('handles /model with provider/model format', () => {
    const result = handleCommand('/model anthropic/claude-3-opus', makeContext(), registry);
    expect(result).toEqual({
      type: 'model-switched',
      provider: 'anthropic',
      model: 'claude-3-opus',
      content: 'Switched to anthropic/claude-3-opus',
    });
  });

  it('handles /models', () => {
    const result = handleCommand('/models', makeContext(), registry);
    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.content).toContain('Available providers');
      expect(result.content).toContain('openai (active)');
    }
  });

  it('handles /provider without arg (show current)', () => {
    const result = handleCommand('/provider', makeContext(), registry);
    expect(result).toEqual({ type: 'message', content: 'Current provider: openai' });
  });

  it('handles /provider with known provider', () => {
    const result = handleCommand('/provider anthropic', makeContext(), registry);
    expect(result.type).toBe('model-switched');
    if (result.type === 'model-switched') {
      expect(result.provider).toBe('anthropic');
    }
  });

  it('handles /provider with unknown provider', () => {
    const result = handleCommand('/provider nonexistent', makeContext(), registry);
    expect(result.type).toBe('error');
  });

  it('handles /save with no messages', () => {
    const result = handleCommand('/save', makeContext({ messages: [] }), registry);
    expect(result).toEqual({ type: 'message', content: 'Nothing to save — no messages in this session.' });
  });

  it('handles /save with messages', () => {
    const result = handleCommand('/save', makeContext(), registry);
    expect(result.type).toBe('session-saved');
    if (result.type === 'session-saved') {
      expect(result.sessionId).toBeTruthy();
      expect(result.content).toContain('Session saved');
    }
  });

  it('handles /load when no sessions exist', () => {
    const result = handleCommand('/load', makeContext(), registry);
    expect(result).toEqual({ type: 'message', content: 'No saved sessions found.' });
  });

  it('handles /load after saving a session', () => {
    handleCommand('/save', makeContext(), registry);
    const result = handleCommand('/load', makeContext(), registry);
    expect(result.type).toBe('session-loaded');
    if (result.type === 'session-loaded') {
      expect(result.messages).toBeDefined();
      expect(result.tokenUsage).toBeDefined();
    }
  });

  it('handles /load with non-existent session id', () => {
    const result = handleCommand('/load nonexistent', makeContext(), registry);
    expect(result).toEqual({ type: 'message', content: 'Session not found: nonexistent' });
  });

  it('handles /history when no sessions exist', () => {
    const result = handleCommand('/history', makeContext(), registry);
    expect(result).toEqual({ type: 'message', content: 'No saved sessions found.' });
  });

  it('handles /history after saving', () => {
    handleCommand('/save', makeContext(), registry);
    const result = handleCommand('/history', makeContext(), registry);
    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.content).toContain('Saved sessions');
    }
  });

  it('handles /export with no messages', () => {
    const result = handleCommand('/export', makeContext({ messages: [] }), registry);
    expect(result).toEqual({ type: 'message', content: 'Nothing to export — no messages in this session.' });
  });

  it('handles /export with messages', () => {
    const result = handleCommand('/export test-export.md', makeContext(), registry);
    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.content).toContain('Exported');
      expect(result.content).toContain('test-export.md');
    }
  });

  it('handles /agent without arg (show current)', () => {
    const result = handleCommand('/agent', makeContext(), registry);
    expect(result).toEqual({
      type: 'message',
      content: 'Current agent: default — General-purpose coding assistant',
    });
  });

  it('handles /agent with non-existent agent', () => {
    const result = handleCommand('/agent nonexistent', makeContext(), registry);
    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.content).toContain('Agent not found');
    }
  });

  it('handles /agents', () => {
    const result = handleCommand('/agents', makeContext(), registry);
    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.content).toContain('Available agents');
    }
  });

  it('handles unknown command', () => {
    const result = handleCommand('/foo', makeContext(), registry);
    expect(result).toEqual({ type: 'unknown-command', command: 'foo' });
  });
});

describe('getErrorHint', () => {
  it('detects API key errors', () => {
    expect(getErrorHint('Invalid API key')).toBe('Check your API key in config or environment variables.');
    expect(getErrorHint('401 Unauthorized')).toBe('Check your API key in config or environment variables.');
    expect(getErrorHint('Authentication failed')).toBe('Check your API key in config or environment variables.');
  });

  it('detects rate limit errors', () => {
    expect(getErrorHint('Rate limit exceeded')).toBe('Rate limited. Wait a moment and try again.');
    expect(getErrorHint('429 Too Many Requests')).toBe('Rate limited. Wait a moment and try again.');
  });

  it('detects network errors', () => {
    expect(getErrorHint('Network error')).toBe('Network error. Check your internet connection.');
    expect(getErrorHint('ECONNREFUSED')).toBe('Network error. Check your internet connection.');
    expect(getErrorHint('fetch failed')).toBe('Network error. Check your internet connection.');
  });

  it('detects context limit errors', () => {
    expect(getErrorHint('Context length exceeded')).toBe('Context limit exceeded. Try /clear to start fresh.');
    expect(getErrorHint('Too long input')).toBe('Context limit exceeded. Try /clear to start fresh.');
    expect(getErrorHint('Maximum token limit')).toBe('Context limit exceeded. Try /clear to start fresh.');
  });

  it('returns null for unknown errors', () => {
    expect(getErrorHint('Something weird happened')).toBeNull();
  });
});
