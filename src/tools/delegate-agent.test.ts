import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDelegateAgent } from './delegate-agent.js';
import type { DelegateAgentDeps } from './delegate-agent.js';
import type { ChainContext, AgentConfig } from '../agents/agent-types.js';
import type { ResolvedConfig } from '../core/types.js';

// Mock external modules
vi.mock('../agents/agent-loader.js', () => ({
  loadAgent: vi.fn(),
}));

vi.mock('../agents/agent-runner.js', () => ({
  runAgent: vi.fn(),
}));

vi.mock('../core/conversation.js', () => ({
  ConversationEngine: vi.fn().mockImplementation(() => ({
    setRegistry: vi.fn(),
    mergeTools: vi.fn(),
    sendMessage: vi.fn(),
  })),
}));

vi.mock('../core/tool-registry.js', () => ({
  createBuiltinTools: vi.fn().mockReturnValue({}),
  getToolMeta: vi.fn().mockReturnValue({}),
}));

vi.mock('../core/stream-utils.js', () => ({
  summarizeToolResult: vi.fn((r: unknown) => r),
  isToolError: vi.fn(() => false),
}));

import { loadAgent } from '../agents/agent-loader.js';
import { runAgent } from '../agents/agent-runner.js';

const mockedLoadAgent = vi.mocked(loadAgent);
const mockedRunAgent = vi.mocked(runAgent);

const makeSubAgent = (overrides?: Partial<AgentConfig>): AgentConfig => ({
  name: 'sub-agent',
  description: 'A sub agent',
  sections: {},
  tools: ['readFile', 'bash'],
  toolMeta: {},
  maxTurns: 10,
  maxConsecutiveErrors: 3,
  continuationPrompt: 'Continue.',
  stopCondition: 'default',
  ...overrides,
});

const makeChainContext = (overrides?: Partial<ChainContext>): ChainContext => ({
  depth: 0,
  maxDepth: 3,
  activeAgents: new Set(['parent']),
  ...overrides,
});

const makeDeps = (overrides?: Partial<DelegateAgentDeps>): DelegateAgentDeps => ({
  cwd: '/test',
  config: { cwd: '/test', provider: 'anthropic', model: 'test', maxTokens: 4096, contextWindow: 128000, approval: {} } as ResolvedConfig,
  registry: { collectTools: vi.fn().mockReturnValue({}), collectMiddleware: vi.fn().mockReturnValue([]) } as unknown as DelegateAgentDeps['registry'],
  model: {} as DelegateAgentDeps['model'],
  approvalCallback: undefined,
  chainContext: makeChainContext(),
  isCancelled: () => false,
  ...overrides,
});

describe('delegateAgent tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully delegates to a known agent and returns result', async () => {
    const subAgent = makeSubAgent();
    mockedLoadAgent.mockReturnValue(subAgent);
    mockedRunAgent.mockResolvedValue({
      status: 'completed',
      finalText: 'All tests passed.',
      allToolCalls: [{ id: 'tc1', toolName: 'bash', args: {}, status: 'completed' }],
      lastError: '',
      turnsUsed: 2,
    });

    const tool = createDelegateAgent(makeDeps());
    const result = await tool.execute(
      { agentName: 'sub-agent', task: 'Run the tests', context: null },
      { toolCallId: 'tc-1', messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toEqual({
      success: true,
      agentName: 'sub-agent',
      status: 'completed',
      summary: 'All tests passed.',
      turnsUsed: 2,
      toolCallCount: 1,
    });
    expect(mockedLoadAgent).toHaveBeenCalledWith('sub-agent', '/test');
    expect(mockedRunAgent).toHaveBeenCalledTimes(1);
  });

  it('returns error when target agent is not found', async () => {
    mockedLoadAgent.mockReturnValue(null);

    const tool = createDelegateAgent(makeDeps());
    const result = await tool.execute(
      { agentName: 'nonexistent', task: 'Do something', context: null },
      { toolCallId: 'tc-2', messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('not found'),
    });
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it('returns error when max depth is exceeded', async () => {
    const chainContext = makeChainContext({ depth: 3, maxDepth: 3 });
    const tool = createDelegateAgent(makeDeps({ chainContext }));
    const result = await tool.execute(
      { agentName: 'sub-agent', task: 'Do something', context: null },
      { toolCallId: 'tc-3', messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Max agent chain depth'),
    });
    expect(mockedLoadAgent).not.toHaveBeenCalled();
  });

  it('returns error on cycle detection', async () => {
    const chainContext = makeChainContext({ activeAgents: new Set(['parent', 'sub-agent']) });
    const tool = createDelegateAgent(makeDeps({ chainContext }));
    const result = await tool.execute(
      { agentName: 'sub-agent', task: 'Do something', context: null },
      { toolCallId: 'tc-4', messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Cycle detected'),
    });
    expect(mockedLoadAgent).not.toHaveBeenCalled();
  });

  it('passes context string to sub-agent input', async () => {
    const subAgent = makeSubAgent();
    mockedLoadAgent.mockReturnValue(subAgent);
    mockedRunAgent.mockResolvedValue({
      status: 'completed',
      finalText: 'Done.',
      allToolCalls: [],
      lastError: '',
      turnsUsed: 1,
    });

    const tool = createDelegateAgent(makeDeps());
    await tool.execute(
      { agentName: 'sub-agent', task: 'Check the code', context: 'I refactored auth module' },
      { toolCallId: 'tc-5', messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    const input = mockedRunAgent.mock.calls[0]![0];
    expect(input).toContain('[Context from parent agent]');
    expect(input).toContain('I refactored auth module');
    expect(input).toContain('[Task]');
    expect(input).toContain('Check the code');
  });

  it('returns error result when sub-agent fails', async () => {
    const subAgent = makeSubAgent();
    mockedLoadAgent.mockReturnValue(subAgent);
    mockedRunAgent.mockResolvedValue({
      status: 'error',
      finalText: 'Something broke',
      allToolCalls: [],
      lastError: 'Command failed',
      turnsUsed: 3,
    });

    const tool = createDelegateAgent(makeDeps());
    const result = await tool.execute(
      { agentName: 'sub-agent', task: 'Run tests', context: null },
      { toolCallId: 'tc-6', messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('failed'),
      agentName: 'sub-agent',
      status: 'error',
    });
  });

  it('handles unexpected exceptions from runAgent', async () => {
    const subAgent = makeSubAgent();
    mockedLoadAgent.mockReturnValue(subAgent);
    mockedRunAgent.mockRejectedValue(new Error('Unexpected crash'));

    const tool = createDelegateAgent(makeDeps());
    const result = await tool.execute(
      { agentName: 'sub-agent', task: 'Run tests', context: null },
      { toolCallId: 'tc-7', messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Unexpected crash'),
    });
  });

  it('calls onSubAgentStart and onSubAgentComplete callbacks', async () => {
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const chainContext = makeChainContext({
      onSubAgentStart: onStart,
      onSubAgentComplete: onComplete,
    });

    const subAgent = makeSubAgent();
    mockedLoadAgent.mockReturnValue(subAgent);
    mockedRunAgent.mockResolvedValue({
      status: 'completed',
      finalText: 'Done.',
      allToolCalls: [],
      lastError: '',
      turnsUsed: 1,
    });

    const tool = createDelegateAgent(makeDeps({ chainContext }));
    await tool.execute(
      { agentName: 'sub-agent', task: 'Do work', context: null },
      { toolCallId: 'tc-8', messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(onStart).toHaveBeenCalledWith('sub-agent', 1);
    expect(onComplete).toHaveBeenCalledWith('sub-agent', 1, expect.objectContaining({ status: 'completed' }));
  });

  it('propagates cancellation to sub-agent', async () => {
    const subAgent = makeSubAgent();
    mockedLoadAgent.mockReturnValue(subAgent);

    let isCancelled = false;
    mockedRunAgent.mockImplementation(async (_input, _agent, callbacks) => {
      // Simulate checking isCancelled inside runAgent
      expect(callbacks.isCancelled()).toBe(false);
      isCancelled = true;
      expect(callbacks.isCancelled()).toBe(true);
      return {
        status: 'cancelled' as const,
        finalText: 'Cancelled.',
        allToolCalls: [],
        lastError: '',
        turnsUsed: 1,
      };
    });

    const tool = createDelegateAgent(makeDeps({ isCancelled: () => isCancelled }));
    const result = await tool.execute(
      { agentName: 'sub-agent', task: 'Do work', context: null },
      { toolCallId: 'tc-9', messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    // Cancelled sub-agent is not an error from the parent's perspective
    expect(result).toMatchObject({ success: true, status: 'cancelled' });
  });

  it('does not pass task as context when context is null', async () => {
    const subAgent = makeSubAgent();
    mockedLoadAgent.mockReturnValue(subAgent);
    mockedRunAgent.mockResolvedValue({
      status: 'completed',
      finalText: 'Done.',
      allToolCalls: [],
      lastError: '',
      turnsUsed: 1,
    });

    const tool = createDelegateAgent(makeDeps());
    await tool.execute(
      { agentName: 'sub-agent', task: 'Simple task', context: null },
      { toolCallId: 'tc-10', messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    const input = mockedRunAgent.mock.calls[0]![0];
    expect(input).toBe('Simple task');
    expect(input).not.toContain('[Context from parent agent]');
  });
});
