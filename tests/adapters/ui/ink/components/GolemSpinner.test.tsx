import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { GolemSpinner } from "#adapters/ui/ink/components/GolemSpinner.js";

describe("GolemSpinner", () => {
  it("renders the progress message", () => {
    const { lastFrame, unmount } = render(<GolemSpinner message="Thinking..." />);
    expect(lastFrame()!).toContain("Thinking...");
    unmount();
  });

  it("shows elapsed time format", () => {
    const { lastFrame, unmount } = render(<GolemSpinner message="Working" />);
    expect(lastFrame()!).toContain("(0s)");
    unmount();
  });
});
