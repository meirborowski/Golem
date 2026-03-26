import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { WelcomeBanner } from "../../../../../src/adapters/ui/ink/components/WelcomeBanner.js";

describe("WelcomeBanner", () => {
  it("renders ASCII logo", () => {
    const { lastFrame } = render(<WelcomeBanner />);
    const frame = lastFrame()!;
    expect(frame).toContain("██████");
  });

  it("shows model name when provided", () => {
    const { lastFrame } = render(<WelcomeBanner modelName="gpt-4o" />);
    expect(lastFrame()!).toContain("gpt-4o");
  });

  it("shows version when provided", () => {
    const { lastFrame } = render(<WelcomeBanner version="0.2.0" />);
    expect(lastFrame()!).toContain("v0.2.0");
  });

  it("shows working directory when provided", () => {
    const { lastFrame } = render(<WelcomeBanner workingDirectory="/home/user/project" />);
    expect(lastFrame()!).toContain("/home/user/project");
  });

  it("renders without optional props", () => {
    const { lastFrame } = render(<WelcomeBanner />);
    const frame = lastFrame()!;
    // Should still render the logo without crashing
    expect(frame).toContain("██");
  });

  it("shows all metadata together", () => {
    const { lastFrame } = render(
      <WelcomeBanner modelName="gpt-4o" version="1.0.0" workingDirectory="/proj" />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("gpt-4o");
    expect(frame).toContain("v1.0.0");
    expect(frame).toContain("/proj");
  });
});
