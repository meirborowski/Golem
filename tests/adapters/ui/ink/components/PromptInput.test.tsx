import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { PromptInput } from "#adapters/ui/ink/components/PromptInput.js";

describe("PromptInput", () => {
  it("renders prompt character", () => {
    const { lastFrame } = render(<PromptInput message="You> " onSubmit={() => {}} />);
    expect(lastFrame()!).toContain("\u276F");
  });

  it("shows hint text when input is empty", () => {
    const { lastFrame } = render(<PromptInput message="You> " onSubmit={() => {}} />);
    expect(lastFrame()!).toContain("exit");
  });

  it("displays tool question above the input", () => {
    const { lastFrame } = render(<PromptInput message="What framework?" onSubmit={() => {}} />);
    expect(lastFrame()!).toContain("What framework?");
  });

  it("hides hint text for tool prompts", () => {
    const { lastFrame } = render(<PromptInput message="What framework?" onSubmit={() => {}} />);
    expect(lastFrame()!).not.toContain("exit");
  });
});
