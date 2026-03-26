import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { MarkdownText } from "../../../../../src/adapters/ui/ink/components/MarkdownText.js";

describe("MarkdownText", () => {
  it("renders plain text", () => {
    const { lastFrame } = render(<MarkdownText content="Hello world" />);
    expect(lastFrame()!).toContain("Hello world");
  });

  it("renders text with markdown formatting", () => {
    const { lastFrame } = render(<MarkdownText content="This is **bold** text" />);
    // marked-terminal converts **bold** to ANSI bold — the text should still appear
    expect(lastFrame()!).toContain("bold");
    expect(lastFrame()!).toContain("text");
  });

  it("renders code blocks", () => {
    const content = "Here is code:\n```\nconst x = 1;\n```";
    const { lastFrame } = render(<MarkdownText content={content} />);
    expect(lastFrame()!).toContain("const x = 1");
  });

  it("renders lists", () => {
    const content = "- item one\n- item two";
    const { lastFrame } = render(<MarkdownText content={content} />);
    expect(lastFrame()!).toContain("item one");
    expect(lastFrame()!).toContain("item two");
  });
});
