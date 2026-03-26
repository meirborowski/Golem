import { describe, it, expect } from "vitest";
import { HumanApprovalStep } from "#pipeline/steps/HumanApprovalStep.js";
import { MockUserInterface } from "../../mocks/MockUserInterface.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

function createContext(): AgentContext {
  return {
    messages: [],
    currentRequest: "",
    workingDirectory: "/project",
    gatheredFiles: new Map(),
    pendingChanges: [],
    shouldContinue: true,
    metadata: {},
  };
}

describe("HumanApprovalStep", () => {
  it("keeps approved changes", async () => {
    const ui = new MockUserInterface([], true);
    const step = new HumanApprovalStep(ui);
    const ctx = createContext();
    ctx.pendingChanges = [
      { filePath: "/a.ts", operation: "create", newContent: "code" },
    ];

    await step.execute(ctx, async () => {});

    expect(ctx.pendingChanges).toHaveLength(1);
  });

  it("clears rejected changes", async () => {
    const ui = new MockUserInterface([], false);
    const step = new HumanApprovalStep(ui);
    const ctx = createContext();
    ctx.pendingChanges = [
      { filePath: "/a.ts", operation: "create", newContent: "code" },
    ];

    await step.execute(ctx, async () => {});

    expect(ctx.pendingChanges).toHaveLength(0);
  });

  it("skips confirmation when no pending changes", async () => {
    const ui = new MockUserInterface([], false);
    const step = new HumanApprovalStep(ui);
    const ctx = createContext();

    await step.execute(ctx, async () => {});

    expect(ctx.pendingChanges).toHaveLength(0);
  });

  it("calls next() before checking changes", async () => {
    const ui = new MockUserInterface([], true);
    const step = new HumanApprovalStep(ui);
    const ctx = createContext();
    let nextCalled = false;

    await step.execute(ctx, async () => {
      nextCalled = true;
      // Simulate a prior step staging changes
      ctx.pendingChanges.push({
        filePath: "/b.ts",
        operation: "modify",
        newContent: "updated",
      });
    });

    expect(nextCalled).toBe(true);
    expect(ctx.pendingChanges).toHaveLength(1);
  });
});
