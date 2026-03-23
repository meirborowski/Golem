import { describe, it, expect, vi } from 'vitest';
import { runAgent } from './agent-runner.js';
import type { AgentConfig, AgentCallbacks } from './agent-types.js';
import type { TurnResult, ToolCallInfo } from '../core/types.js';

const makeAgent = (overrides?: Partial<AgentConfig>): AgentConfig => ({
  name: 'test',
  description: 'Test agent',
  sections: {},
  tools: [],
  toolMeta: {},
  maxTurns: 20,
  maxConsecutiveErrors: 3,
  continuationPrompt: 'Continue.',
  stopCondition: 'default',
  ...overrides,
});

const makeTurnResult = (overrides?: Partial<TurnResult>): TurnResult => ({
  hadToolCalls: false,
  agentDoneCalled: false,
  hadTextOutput: false,
  errorCount: 0,
  finalText: '',
  toolCalls: [],
  lastError: '',
  ...overrides,
});

const makeToolCall = (overrides?: Partial<ToolCallInfo>): ToolCallInfo => ({
  id: `tc-${Date.now()}`,
  toolName: 'readFile',
  args: {},
  status: 'completed',
  ...overrides,
});

describe('agent-runner', () => {
  describe('single turn — text Q&A', () => {
    it('stops after one turn when model produces text without tool calls', async () => {
      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>().mockResolvedValueOnce(
        makeTurnResult({ hadTextOutput: true, finalText: 'Here is your answer.' }),
      );

      const result = await runAgent('What is X?', makeAgent(), {
        sendMessage,
        onTurnComplete: vi.fn(),
        isCancelled: () => false,
      });

      expect(result.status).toBe('completed');
      expect(result.finalText).toBe('Here is your answer.');
      expect(result.turnsUsed).toBe(1);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('agentDone', () => {
    it('stops when agentDone is called in first turn', async () => {
      const agentDoneTc = makeToolCall({
        toolName: 'agentDone',
        result: { summary: 'Done with the task.' },
      });

      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>().mockResolvedValueOnce(
        makeTurnResult({
          hadToolCalls: true,
          agentDoneCalled: true,
          toolCalls: [agentDoneTc],
        }),
      );

      const result = await runAgent('Fix the bug', makeAgent(), {
        sendMessage,
        onTurnComplete: vi.fn(),
        isCancelled: () => false,
      });

      expect(result.status).toBe('completed');
      expect(result.finalText).toBe('Done with the task.');
      expect(result.turnsUsed).toBe(1);
    });

    it('extracts summary from _summary field', async () => {
      const agentDoneTc = makeToolCall({
        toolName: 'agentDone',
        result: { _summary: 'Alt summary.' },
      });

      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>().mockResolvedValueOnce(
        makeTurnResult({
          hadToolCalls: true,
          agentDoneCalled: true,
          toolCalls: [agentDoneTc],
        }),
      );

      const result = await runAgent('Do it', makeAgent(), {
        sendMessage,
        onTurnComplete: vi.fn(),
        isCancelled: () => false,
      });

      expect(result.finalText).toBe('Alt summary.');
    });
  });

  describe('multi-turn continuation', () => {
    it('continues when model calls tools without text', async () => {
      const tc = makeToolCall();
      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>()
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, toolCalls: [tc] }))
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, toolCalls: [tc] }))
        .mockResolvedValueOnce(
          makeTurnResult({ hadToolCalls: true, agentDoneCalled: true, toolCalls: [makeToolCall({ toolName: 'agentDone', result: { summary: 'All done.' } })] }),
        );

      const onTurnComplete = vi.fn();

      const result = await runAgent('Refactor it', makeAgent(), {
        sendMessage,
        onTurnComplete,
        isCancelled: () => false,
      });

      expect(result.status).toBe('completed');
      expect(result.turnsUsed).toBe(3);
      expect(sendMessage).toHaveBeenCalledTimes(3);
      expect(onTurnComplete).toHaveBeenCalledWith(1);
      expect(onTurnComplete).toHaveBeenCalledWith(2);
      expect(onTurnComplete).toHaveBeenCalledWith(3);
    });

    it('stops when model produces tools + text (gathered info and answered)', async () => {
      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>()
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, toolCalls: [makeToolCall()] }))
        .mockResolvedValueOnce(
          makeTurnResult({ hadToolCalls: true, hadTextOutput: true, finalText: 'Found it.', toolCalls: [makeToolCall()] }),
        );

      const result = await runAgent('Find X', makeAgent(), {
        sendMessage,
        onTurnComplete: vi.fn(),
        isCancelled: () => false,
      });

      expect(result.status).toBe('completed');
      expect(result.finalText).toBe('Found it.');
      expect(result.turnsUsed).toBe(2);
    });
  });

  describe('error handling', () => {
    it('stops after max consecutive errors', async () => {
      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>()
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, errorCount: 1, toolCalls: [makeToolCall()] }))
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, errorCount: 1, toolCalls: [makeToolCall()] }))
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, errorCount: 1, toolCalls: [makeToolCall()] }));

      const result = await runAgent('Do it', makeAgent({ maxConsecutiveErrors: 3 }), {
        sendMessage,
        onTurnComplete: vi.fn(),
        isCancelled: () => false,
      });

      expect(result.status).toBe('error');
    });

    it('resets consecutive errors on successful turn', async () => {
      const tc = makeToolCall();
      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>()
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, errorCount: 1, toolCalls: [tc] }))
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, errorCount: 0, toolCalls: [tc] }))
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, errorCount: 1, toolCalls: [tc] }))
        .mockResolvedValueOnce(
          makeTurnResult({ hadToolCalls: true, agentDoneCalled: true, toolCalls: [makeToolCall({ toolName: 'agentDone', result: { summary: 'Done.' } })] }),
        );

      const result = await runAgent('Do it', makeAgent({ maxConsecutiveErrors: 3 }), {
        sendMessage,
        onTurnComplete: vi.fn(),
        isCancelled: () => false,
      });

      expect(result.status).toBe('completed');
    });

    it('stops immediately on fatal error (errors + no tools + no text)', async () => {
      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>().mockResolvedValueOnce(
        makeTurnResult({ errorCount: 1 }),
      );

      const result = await runAgent('Do it', makeAgent(), {
        sendMessage,
        onTurnComplete: vi.fn(),
        isCancelled: () => false,
      });

      expect(result.status).toBe('error');
      expect(result.turnsUsed).toBe(1);
    });
  });

  describe('cancellation', () => {
    it('stops when cancelled between turns', async () => {
      let turn = 0;
      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>()
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, toolCalls: [makeToolCall()] }))
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, toolCalls: [makeToolCall()] }));

      const result = await runAgent('Do it', makeAgent(), {
        sendMessage,
        onTurnComplete: () => { turn++; },
        isCancelled: () => turn >= 2,
      });

      expect(result.status).toBe('cancelled');
    });
  });

  describe('maxTurns', () => {
    it('stops at maxTurns', async () => {
      const tc = makeToolCall();
      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>()
        .mockResolvedValue(makeTurnResult({ hadToolCalls: true, toolCalls: [tc] }));

      const result = await runAgent('Do it', makeAgent({ maxTurns: 3 }), {
        sendMessage,
        onTurnComplete: vi.fn(),
        isCancelled: () => false,
      });

      expect(result.turnsUsed).toBe(3);
      expect(sendMessage).toHaveBeenCalledTimes(3);
    });
  });

  describe('stopCondition variants', () => {
    it('single-turn runs exactly one turn', async () => {
      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>().mockResolvedValueOnce(
        makeTurnResult({ hadToolCalls: true, toolCalls: [makeToolCall()] }),
      );

      const result = await runAgent('Do it', makeAgent({ stopCondition: 'single-turn' }), {
        sendMessage,
        onTurnComplete: vi.fn(),
        isCancelled: () => false,
      });

      expect(result.turnsUsed).toBe(1);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it('agent-done-only continues even with tools + text', async () => {
      const tc = makeToolCall();
      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>()
        .mockResolvedValueOnce(
          makeTurnResult({ hadToolCalls: true, hadTextOutput: true, finalText: 'Partial.', toolCalls: [tc] }),
        )
        .mockResolvedValueOnce(
          makeTurnResult({ hadToolCalls: true, agentDoneCalled: true, finalText: 'Final.', toolCalls: [makeToolCall({ toolName: 'agentDone', result: { summary: 'Final.' } })] }),
        );

      const result = await runAgent('Do it', makeAgent({ stopCondition: 'agent-done-only' }), {
        sendMessage,
        onTurnComplete: vi.fn(),
        isCancelled: () => false,
      });

      expect(result.status).toBe('completed');
      expect(result.turnsUsed).toBe(2);
      // Key assertion: the agent continued past tools+text in turn 1 (unlike 'default' mode)
      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(result.finalText).toBe('Final.');
    });
  });

  describe('continuationPrompt', () => {
    it('uses the agent continuationPrompt for subsequent turns', async () => {
      const sendMessage = vi.fn<AgentCallbacks['sendMessage']>()
        .mockResolvedValueOnce(makeTurnResult({ hadToolCalls: true, toolCalls: [makeToolCall()] }))
        .mockResolvedValueOnce(makeTurnResult({ hadTextOutput: true, finalText: 'Done.' }));

      await runAgent('Start', makeAgent({ continuationPrompt: 'Custom continue.' }), {
        sendMessage,
        onTurnComplete: vi.fn(),
        isCancelled: () => false,
      });

      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(sendMessage.mock.calls[1]![0]).toBe('Custom continue.');
    });
  });
});
