import { describe, it, expect } from "vitest";
import { UIBridge } from "#adapters/ui/ink/UIBridge.js";
import type { PromptRequest, ConfirmRequest } from "#adapters/ui/ink/UIBridge.js";

describe("UIBridge", () => {
  it("requestPrompt emits event and resolves on response", async () => {
    const bridge = new UIBridge();

    bridge.on("prompt-request", (req: PromptRequest) => {
      expect(req.message).toBe("You> ");
      req.resolve("hello world");
    });

    const result = await bridge.requestPrompt("You> ");
    expect(result).toBe("hello world");
  });

  it("pushDisplay emits display event", () => {
    const bridge = new UIBridge();
    const messages: string[] = [];

    bridge.on("display", (msg: string) => messages.push(msg));
    bridge.pushDisplay("hello");
    bridge.pushDisplay("world");

    expect(messages).toEqual(["hello", "world"]);
  });

  it("pushStreamChunk and pushStreamEnd emit correct events", () => {
    const bridge = new UIBridge();
    const chunks: string[] = [];
    let ended = false;

    bridge.on("stream-chunk", (chunk: string) => chunks.push(chunk));
    bridge.on("stream-end", () => { ended = true; });

    bridge.pushStreamChunk("hel");
    bridge.pushStreamChunk("lo");
    bridge.pushStreamEnd();

    expect(chunks).toEqual(["hel", "lo"]);
    expect(ended).toBe(true);
  });

  it("pushError emits error event", () => {
    const bridge = new UIBridge();
    const errors: string[] = [];

    bridge.on("error", (msg: string) => errors.push(msg));
    bridge.pushError("oops");

    expect(errors).toEqual(["oops"]);
  });

  it("requestConfirmChanges emits event and resolves on response", async () => {
    const bridge = new UIBridge();
    const changes = [{ filePath: "/a.ts", operation: "create" as const, newContent: "code" }];

    bridge.on("confirm-request", (req: ConfirmRequest) => {
      expect(req.changes).toEqual(changes);
      req.resolve(changes);
    });

    const result = await bridge.requestConfirmChanges(changes);
    expect(result).toEqual(changes);
  });

  it("startProgress and stopProgress emit events", () => {
    const bridge = new UIBridge();
    let startMsg = "";
    let stopped = false;

    bridge.on("progress-start", (msg: string) => { startMsg = msg; });
    bridge.on("progress-stop", () => { stopped = true; });

    bridge.startProgress("Thinking...");
    bridge.stopProgress();

    expect(startMsg).toBe("Thinking...");
    expect(stopped).toBe(true);
  });
});
