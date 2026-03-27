import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { MessageLog } from "#adapters/ui/ink/components/MessageLog.js";
import type { MessageEntry } from "#adapters/ui/ink/hooks/useUIBridge.js";

describe("MessageLog", () => {
  it("renders user messages with prompt chevron", () => {
    const messages: MessageEntry[] = [{ type: "user", content: "hello" }];
    const { lastFrame } = render(<MessageLog messages={messages} />);
    expect(lastFrame()!).toContain("\u276F");
    expect(lastFrame()!).toContain("hello");
  });

  it("renders error messages with \u2718 prefix", () => {
    const messages: MessageEntry[] = [{ type: "error", content: "something broke" }];
    const { lastFrame } = render(<MessageLog messages={messages} />);
    expect(lastFrame()!).toContain("\u2718");
    expect(lastFrame()!).toContain("something broke");
  });

  it("renders tool-call messages with \u26A1 prefix", () => {
    const messages: MessageEntry[] = [{
      type: "tool-call",
      content: "readFile /src/index.ts",
      toolName: "Read file",
      keyArg: "/src/index.ts",
      status: "success" as const,
    }];
    const { lastFrame } = render(<MessageLog messages={messages} />);
    expect(lastFrame()!).toContain("\u26A1");
    expect(lastFrame()!).toContain("Read file");
    expect(lastFrame()!).toContain("\u2714");
  });

  it("renders system messages without prefix", () => {
    const messages: MessageEntry[] = [{ type: "system", content: "Golem is ready." }];
    const { lastFrame } = render(<MessageLog messages={messages} />);
    expect(lastFrame()!).toContain("Golem is ready.");
  });

  it("renders assistant messages", () => {
    const messages: MessageEntry[] = [{ type: "assistant", content: "Here is the answer." }];
    const { lastFrame } = render(<MessageLog messages={messages} />);
    expect(lastFrame()!).toContain("Here is the answer");
  });

  it("renders multiple messages in order", () => {
    const messages: MessageEntry[] = [
      { type: "user", content: "question" },
      { type: "assistant", content: "answer" },
    ];
    const { lastFrame } = render(<MessageLog messages={messages} />);
    const frame = lastFrame()!;
    const qPos = frame.indexOf("question");
    const aPos = frame.indexOf("answer");
    expect(qPos).toBeLessThan(aPos);
  });

  it("renders tool-call error with result summary", () => {
    const messages: MessageEntry[] = [{
      type: "tool-call",
      content: "executeCommand npm test",
      toolName: "Run command",
      keyArg: "npm test",
      status: "error" as const,
      resultSummary: "Error: process exited with code 1",
    }];
    const { lastFrame } = render(<MessageLog messages={messages} />);
    expect(lastFrame()!).toContain("\u2718");
    expect(lastFrame()!).toContain("Error: process exited with code 1");
  });
});
