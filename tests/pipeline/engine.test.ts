import { describe, it, expect } from "vitest";
import { PipelineEngine } from "#pipeline/engine.js";
import type { IPipelineStep, NextFunction } from "#core/interfaces/IPipelineStep.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

function createContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    messages: [],
    currentRequest: "",
    workingDirectory: "/test",
    gatheredFiles: new Map(),
    pendingChanges: [],
    shouldContinue: true,
    metadata: {},
    ...overrides,
  };
}

function createStep(name: string, fn: (ctx: AgentContext, next: NextFunction) => Promise<void>): IPipelineStep {
  return { name, execute: fn };
}

describe("PipelineEngine", () => {
  it("executes steps in registration order", async () => {
    const engine = new PipelineEngine();
    const order: string[] = [];

    engine.register(createStep("first", async (_ctx, next) => {
      order.push("first");
      await next();
    }));
    engine.register(createStep("second", async (_ctx, next) => {
      order.push("second");
      await next();
    }));

    await engine.run(createContext());
    expect(order).toEqual(["first", "second"]);
  });

  it("allows a step to short-circuit by not calling next", async () => {
    const engine = new PipelineEngine();
    const order: string[] = [];

    engine.register(createStep("blocker", async () => {
      order.push("blocker");
      // intentionally not calling next()
    }));
    engine.register(createStep("unreached", async (_ctx, next) => {
      order.push("unreached");
      await next();
    }));

    await engine.run(createContext());
    expect(order).toEqual(["blocker"]);
  });

  it("allows steps to modify context before and after next", async () => {
    const engine = new PipelineEngine();

    engine.register(createStep("wrapper", async (ctx, next) => {
      ctx.metadata["before"] = true;
      await next();
      ctx.metadata["after"] = true;
    }));
    engine.register(createStep("inner", async (ctx, next) => {
      ctx.metadata["inner"] = true;
      await next();
    }));

    const ctx = createContext();
    await engine.run(ctx);
    expect(ctx.metadata).toEqual({ before: true, inner: true, after: true });
  });

  it("runs with no steps registered", async () => {
    const engine = new PipelineEngine();
    const ctx = createContext();
    await engine.run(ctx);
    expect(ctx.shouldContinue).toBe(true);
  });
});
