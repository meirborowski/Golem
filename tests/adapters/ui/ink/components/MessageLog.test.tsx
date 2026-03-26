import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { MessageLog } from "../../../../../src/adapters/ui/ink/components/MessageLog.js";
import type { MessageEntry } from "../../../../../src/adapters/ui/ink/hooks/useUIBridge.js";

describe("MessageLog", () => {
  it("renders user messages with 'You' prefix", () => {
    const messages: MessageEntry[] = [{ type: "user", content: "hello" }];
    const { lastFrame } = render(<MessageLog messages={messages} />);
    expect(lastFrame()!).toContain("You");
    expect(lastFrame()!).toContain("hello");
  });

  it("renders error messages with ✘ prefix", () => {
    const messages: MessageEntry[] = [{ type: "error", content: "something broke" }];
    const { lastFrame } = render(<MessageLog messages={messages} />);
    expect(lastFrame()!).toContain("\u2718");
    expect(lastFrame()!).toContain("something broke");
  });

  it("renders tool-call messages with ⚡ prefix", () => {
    const messages: MessageEntry[] = [{ type: "tool-call", content: "readFile /src/index.ts" }];
    const { lastFrame } = render(<MessageLog messages={messages} />);
    expect(lastFrame()!).toContain("\u26A1");
    expect(lastFrame()!).toContain("readFile");
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

  it("renders border character for each message", () => {
    const messages: MessageEntry[] = [{ type: "user", content: "test" }];
    const { lastFrame } = render(<MessageLog messages={messages} />);
    expect(lastFrame()!).toContain("\u2502");
  });
});
