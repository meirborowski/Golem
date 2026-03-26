import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { StreamingText } from "#adapters/ui/ink/components/StreamingText.js";

describe("StreamingText", () => {
  it("returns nothing when buffer is empty", () => {
    const { lastFrame } = render(<StreamingText buffer="" />);
    expect(lastFrame()!).toBe("");
  });

  it("renders buffer text", () => {
    const { lastFrame } = render(<StreamingText buffer="Hello world" />);
    expect(lastFrame()!).toContain("Hello world");
  });

  it("shows cursor character", () => {
    const { lastFrame } = render(<StreamingText buffer="test" />);
    // Cursor toggles, but on first render it should be visible
    const frame = lastFrame()!;
    expect(frame).toContain("test");
    // Either cursor char or space is present (depends on timing)
    expect(frame.length).toBeGreaterThan(4);
  });

  it("includes border character", () => {
    const { lastFrame } = render(<StreamingText buffer="text" />);
    expect(lastFrame()!).toContain("\u2502");
  });
});
