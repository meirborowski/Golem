import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { GolemApp } from "#adapters/ui/ink/components/GolemApp.js";
import { UIBridge } from "#adapters/ui/ink/UIBridge.js";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("GolemApp", () => {
  it("renders welcome banner and status bar on mount", () => {
    const bridge = new UIBridge();
    const { lastFrame, unmount } = render(
      <GolemApp bridge={bridge} config={{ modelName: "gpt-4o", version: "0.2.0" }} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("██████");
    expect(frame).toContain("gpt-4o");
    unmount();
  });

  it("shows prompt input when prompt-request is emitted", async () => {
    const bridge = new UIBridge();
    const { lastFrame, unmount } = render(<GolemApp bridge={bridge} />);

    // Don't await — just trigger the event
    bridge.requestPrompt("You> ");
    await delay(50);

    expect(lastFrame()!).toContain("\u276F");
    unmount();
  });

  it("shows spinner when progress-start is emitted", async () => {
    const bridge = new UIBridge();
    const { lastFrame, unmount } = render(<GolemApp bridge={bridge} />);

    bridge.startProgress("Thinking...");
    await delay(50);

    expect(lastFrame()!).toContain("Thinking...");
    unmount();
  });

  it("shows streaming text when stream-chunk is emitted", async () => {
    const bridge = new UIBridge();
    const { lastFrame, unmount } = render(<GolemApp bridge={bridge} />);

    bridge.pushStreamChunk("Hello from LLM");
    await delay(50);

    expect(lastFrame()!).toContain("Hello from LLM");
    unmount();
  });

  it("commits streamed text to message log on stream-end", async () => {
    const bridge = new UIBridge();
    const { lastFrame, unmount } = render(<GolemApp bridge={bridge} />);

    bridge.pushStreamChunk("Streamed content");
    await delay(50);
    bridge.pushStreamEnd();
    await delay(50);

    expect(lastFrame()!).toContain("Streamed content");
    unmount();
  });

  it("shows display messages in message log", async () => {
    const bridge = new UIBridge();
    const { lastFrame, unmount } = render(<GolemApp bridge={bridge} />);

    bridge.pushDisplay("System message");
    await delay(50);

    expect(lastFrame()!).toContain("System message");
    unmount();
  });

  it("shows error messages in message log", async () => {
    const bridge = new UIBridge();
    const { lastFrame, unmount } = render(<GolemApp bridge={bridge} />);

    bridge.pushError("Something failed");
    await delay(50);

    expect(lastFrame()!).toContain("Something failed");
    unmount();
  });

  it("renders status bar with hints", () => {
    const bridge = new UIBridge();
    const { lastFrame, unmount } = render(<GolemApp bridge={bridge} />);
    // Default state is idle
    expect(lastFrame()!).toContain("\u2500");
    unmount();
  });
});
