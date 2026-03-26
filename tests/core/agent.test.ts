import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { simulateReadableStream } from "ai";
import { Agent } from "#core/agent.js";
import { PipelineEngine } from "#pipeline/engine.js";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { MockUserInterface } from "../mocks/MockUserInterface.js";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";

function mockStreamResult(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        { type: "text-start" as const, id: "text-1" },
        { type: "text-delta" as const, id: "text-1", delta: text },
        { type: "text-end" as const, id: "text-1" },
        { type: "finish" as const, usage: { inputTokens: 10, outputTokens: 5 }, finishReason: "stop" as const },
      ],
      chunkDelayInMs: 0,
    }),
  };
}

function createAgent(opts: {
  userInputs?: string[];
  streamText?: string;
  approveChanges?: boolean;
  files?: Record<string, string>;
}) {
  const ui = new MockUserInterface(opts.userInputs ?? ["exit"], opts.approveChanges ?? true);
  const fs = new MemoryFileSystemAdapter(opts.files);
  const exec = new MockExecutionEnvironment();

  const model = new MockLanguageModelV3({
    doStream: mockStreamResult(opts.streamText ?? "Hello! How can I help?"),
  });

  const agent = new Agent({
    model,
    fs,
    ui,
    exec,
    prePipeline: new PipelineEngine(),
    postPipeline: new PipelineEngine(),
    workingDirectory: "/project",
  });

  return { agent, ui, fs, exec, model };
}

describe("Agent", () => {
  it("displays goodbye message on exit", async () => {
    const { agent, ui } = createAgent({ userInputs: ["exit"] });
    await agent.run();
    expect(ui.displayed[ui.displayed.length - 1]).toBe("Goodbye.");
  });

  it("streams LLM response to displayStream", async () => {
    const { agent, ui } = createAgent({
      userInputs: ["Hello", "exit"],
      streamText: "Hi there!",
    });

    await agent.run();
    // Streamed chunks should contain the text
    const streamed = ui.streamedChunks.filter(c => c !== "[END]").join("");
    expect(streamed).toBe("Hi there!");
    // Should have called displayStreamEnd
    expect(ui.streamedChunks).toContain("[END]");
  });

  it("applies pending changes staged by post-pipeline", async () => {
    const fs = new MemoryFileSystemAdapter();
    const ui = new MockUserInterface(["do something", "exit"]);
    const postPipeline = new PipelineEngine();
    postPipeline.register({
      name: "stageChange",
      execute: async (ctx, next) => {
        ctx.pendingChanges.push({
          filePath: "/project/test.ts",
          operation: "create",
          newContent: "console.log('hello');",
        });
        await next();
      },
    });

    const model = new MockLanguageModelV3({
      doStream: mockStreamResult("Done"),
    });

    const agent = new Agent({
      model,
      fs,
      ui,
      exec: new MockExecutionEnvironment(),
      prePipeline: new PipelineEngine(),
      postPipeline,
      workingDirectory: "/project",
    });

    await agent.run();
    expect(await fs.exists("/project/test.ts")).toBe(true);
    expect(await fs.readFile("/project/test.ts")).toBe("console.log('hello');");
  });

  it("runs pre and post pipelines", async () => {
    const order: string[] = [];
    const prePipeline = new PipelineEngine();
    const postPipeline = new PipelineEngine();

    prePipeline.register({
      name: "pre",
      execute: async (_ctx, next) => { order.push("pre"); await next(); },
    });
    postPipeline.register({
      name: "post",
      execute: async (_ctx, next) => { order.push("post"); await next(); },
    });

    const ui = new MockUserInterface(["test", "exit"]);
    const model = new MockLanguageModelV3({
      doStream: mockStreamResult("ok"),
    });

    const agent = new Agent({
      model,
      fs: new MemoryFileSystemAdapter(),
      ui,
      exec: new MockExecutionEnvironment(),
      prePipeline,
      postPipeline,
      workingDirectory: "/project",
    });

    await agent.run();
    expect(order).toEqual(["pre", "post"]);
  });
});
