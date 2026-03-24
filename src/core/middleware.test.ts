import { describe, it, expect, vi } from 'vitest';
import { applyMiddleware } from './middleware.js';
import { createApprovalMiddleware, resolveToolApproval } from './middlewares/approval.js';
import type { ToolMiddleware, ToolContext } from './middleware.js';
import type { ResolvedConfig, ApprovalConfig } from './types.js';

// Minimal config stub for tests
const stubConfig = { approval: { tools: {} } } as unknown as ResolvedConfig;

function makeTool(executeFn: (args: unknown, ctx: unknown) => Promise<unknown>) {
  return {
    description: 'test tool',
    execute: executeFn,
  };
}

// ── applyMiddleware ──────────────────────────────────────────────────────────

describe('applyMiddleware', () => {
  it('returns the tool unchanged when no middleware is provided', () => {
    const tool = makeTool(async () => 'ok');
    const result = applyMiddleware(tool, 'test', stubConfig, []);
    expect(result).toBe(tool);
  });

  it('calls middleware in order (first registered runs first)', async () => {
    const order: string[] = [];

    const mw1: ToolMiddleware = async (_ctx, next) => {
      order.push('mw1-before');
      const result = await next();
      order.push('mw1-after');
      return result;
    };

    const mw2: ToolMiddleware = async (_ctx, next) => {
      order.push('mw2-before');
      const result = await next();
      order.push('mw2-after');
      return result;
    };

    const tool = makeTool(async () => {
      order.push('execute');
      return 'done';
    });

    const wrapped = applyMiddleware(tool, 'test', stubConfig, [mw1, mw2]);
    const result = await wrapped.execute({}, { toolCallId: 'call-1' });

    expect(result).toBe('done');
    expect(order).toEqual(['mw1-before', 'mw2-before', 'execute', 'mw2-after', 'mw1-after']);
  });

  it('allows middleware to short-circuit without calling next', async () => {
    const executeFn = vi.fn(async () => 'should not run');

    const blocker: ToolMiddleware = async () => {
      return { success: false, error: 'blocked' };
    };

    const tool = makeTool(executeFn);
    const wrapped = applyMiddleware(tool, 'test', stubConfig, [blocker]);
    const result = await wrapped.execute({}, { toolCallId: 'call-1' });

    expect(result).toEqual({ success: false, error: 'blocked' });
    expect(executeFn).not.toHaveBeenCalled();
  });

  it('allows middleware to transform args via ctx.args', async () => {
    const mw: ToolMiddleware = async (ctx, next) => {
      ctx.args = { ...(ctx.args as Record<string, unknown>), injected: true };
      return next();
    };

    const tool = makeTool(async (args) => args);
    const wrapped = applyMiddleware(tool, 'test', stubConfig, [mw]);
    const result = await wrapped.execute({ original: true }, { toolCallId: 'call-1' });

    expect(result).toEqual({ original: true, injected: true });
  });

  it('allows middleware to transform the result', async () => {
    const mw: ToolMiddleware = async (_ctx, next) => {
      const result = (await next()) as Record<string, unknown>;
      return { ...result, extra: 'added' };
    };

    const tool = makeTool(async () => ({ value: 1 }));
    const wrapped = applyMiddleware(tool, 'test', stubConfig, [mw]);
    const result = await wrapped.execute({}, { toolCallId: 'call-1' });

    expect(result).toEqual({ value: 1, extra: 'added' });
  });

  it('populates ToolContext correctly', async () => {
    let capturedCtx: ToolContext | undefined;

    const mw: ToolMiddleware = async (ctx, next) => {
      capturedCtx = { ...ctx };
      return next();
    };

    const tool = makeTool(async () => 'ok');
    const wrapped = applyMiddleware(tool, 'myTool', stubConfig, [mw]);
    await wrapped.execute({ key: 'val' }, { toolCallId: 'tc-42' });

    expect(capturedCtx).toBeDefined();
    expect(capturedCtx!.toolName).toBe('myTool');
    expect(capturedCtx!.toolCallId).toBe('tc-42');
    expect(capturedCtx!.args).toEqual({ key: 'val' });
    expect(capturedCtx!.config).toBe(stubConfig);
  });
});

// ── resolveToolApproval ──────────────────────────────────────────────────────

describe('resolveToolApproval', () => {
  it('returns the configured mode for a known tool', () => {
    const config: ApprovalConfig = { tools: { bash: { approval: 'always' } } };
    expect(resolveToolApproval('bash', config)).toBe('always');
  });

  it('defaults to never for unconfigured tools', () => {
    expect(resolveToolApproval('unknown', {})).toBe('never');
  });
});

// ── createApprovalMiddleware ─────────────────────────────────────────────────

describe('createApprovalMiddleware', () => {
  it('passes through when mode is never', async () => {
    const approvalFn = vi.fn();
    const mw = createApprovalMiddleware({ tools: { bash: { approval: 'never' } } }, approvalFn, {});

    const tool = makeTool(async () => 'executed');
    const wrapped = applyMiddleware(tool, 'bash', stubConfig, [mw]);
    const result = await wrapped.execute({}, { toolCallId: 'c1' });

    expect(result).toBe('executed');
    expect(approvalFn).not.toHaveBeenCalled();
  });

  it('blocks when mode is always and user denies', async () => {
    const approvalFn = vi.fn(async () => false);
    const mw = createApprovalMiddleware({ tools: { bash: { approval: 'always' } } }, approvalFn, {});

    const executeFn = vi.fn(async () => 'should not run');
    const tool = makeTool(executeFn);
    const wrapped = applyMiddleware(tool, 'bash', stubConfig, [mw]);
    const result = await wrapped.execute({}, { toolCallId: 'c1' });

    expect(result).toEqual({ success: false, error: 'Command denied by user' });
    expect(executeFn).not.toHaveBeenCalled();
  });

  it('allows when mode is always and user approves', async () => {
    const approvalFn = vi.fn(async () => true);
    const mw = createApprovalMiddleware({ tools: { bash: { approval: 'always' } } }, approvalFn, {});

    const tool = makeTool(async () => 'executed');
    const wrapped = applyMiddleware(tool, 'bash', stubConfig, [mw]);
    const result = await wrapped.execute({}, { toolCallId: 'c1' });

    expect(result).toBe('executed');
    expect(approvalFn).toHaveBeenCalledOnce();
  });

  it('uses conditional check when mode is conditional', async () => {
    const approvalFn = vi.fn(async () => true);
    const check = vi.fn((args: unknown) => (args as { dangerous: boolean }).dangerous);
    const mw = createApprovalMiddleware(
      { tools: { git: { approval: 'conditional' } } },
      approvalFn,
      { git: check },
    );

    const tool = makeTool(async () => 'ok');

    // Safe call — check returns false, no approval needed
    const wrapped = applyMiddleware(tool, 'git', stubConfig, [mw]);
    await wrapped.execute({ dangerous: false }, { toolCallId: 'c1' });
    expect(approvalFn).not.toHaveBeenCalled();

    // Dangerous call — check returns true, approval needed
    await wrapped.execute({ dangerous: true }, { toolCallId: 'c2' });
    expect(approvalFn).toHaveBeenCalledOnce();
  });

  it('falls back to always when conditional has no check registered', async () => {
    const approvalFn = vi.fn(async () => true);
    const mw = createApprovalMiddleware(
      { tools: { myTool: { approval: 'conditional' } } },
      approvalFn,
      {}, // no check for myTool
    );

    const tool = makeTool(async () => 'ok');
    const wrapped = applyMiddleware(tool, 'myTool', stubConfig, [mw]);
    await wrapped.execute({}, { toolCallId: 'c1' });

    // Should have asked for approval since no conditional check exists
    expect(approvalFn).toHaveBeenCalledOnce();
  });
});
