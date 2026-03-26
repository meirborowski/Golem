import { describe, it, expect } from "vitest";
import { UIBridge } from "../../../../src/adapters/ui/ink/UIBridge.js";
import type { PromptRequest, ConfirmRequest } from "../../../../src/adapters/ui/ink/UIBridge.js";

// Test the InkAdapter's behavior via UIBridge directly (avoids needing ink-testing-library
// for unit tests — the bridge is the contract between adapter and React).

describe("InkAdapter behavior (via UIBridge)", () => {
  it("prompt delegates to bridge requestPrompt", async () => {
    const bridge = new UIBridge();

    bridge.on("prompt-request", (req: PromptRequest) => {
      req.resolve("user input");
    });

    const result = await bridge.requestPrompt("You> ");
    expect(result).toBe("user input");
  });

  it("display pushes to bridge", () => {
    const bridge = new UIBridge();
    const received: string[] = [];

    bridge.on("display", (msg: string) => received.push(msg));
    bridge.pushDisplay("hello");

    expect(received).toEqual(["hello"]);
  });

  it("displayStream and displayStreamEnd flow correctly", () => {
    const bridge = new UIBridge();
    const chunks: string[] = [];
    let ended = false;

    bridge.on("stream-chunk", (c: string) => chunks.push(c));
    bridge.on("stream-end", () => { ended = true; });

    bridge.pushStreamChunk("hel");
    bridge.pushStreamChunk("lo");
    bridge.pushStreamEnd();

    expect(chunks).toEqual(["hel", "lo"]);
    expect(ended).toBe(true);
  });

  it("confirmChanges delegates to bridge", async () => {
    const bridge = new UIBridge();
    const changes = [{ filePath: "/a.ts", operation: "create" as const, newContent: "x" }];

    bridge.on("confirm-request", (req: ConfirmRequest) => {
      req.resolve(req.changes);
    });

    const result = await bridge.requestConfirmChanges(changes);
    expect(result).toEqual(changes);
  });

  it("showProgress emits start and stop events", () => {
    const bridge = new UIBridge();
    let startMsg = "";
    let stopped = false;

    bridge.on("progress-start", (msg: string) => { startMsg = msg; });
    bridge.on("progress-stop", () => { stopped = true; });

    bridge.startProgress("Thinking...");
    expect(startMsg).toBe("Thinking...");

    bridge.stopProgress();
    expect(stopped).toBe(true);
  });

  it("displayError pushes error to bridge", () => {
    const bridge = new UIBridge();
    const errors: string[] = [];

    bridge.on("error", (msg: string) => errors.push(msg));
    bridge.pushError("something broke");

    expect(errors).toEqual(["something broke"]);
  });
});
