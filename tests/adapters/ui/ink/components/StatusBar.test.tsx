import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { StatusBar } from "#adapters/ui/ink/components/StatusBar.js";

describe("StatusBar", () => {
  it("shows model name", () => {
    const { lastFrame } = render(
      <StatusBar appState="idle" modelName="gpt-4o" />
    );
    expect(lastFrame()!).toContain("gpt-4o");
  });

  it("shows working directory", () => {
    const { lastFrame } = render(
      <StatusBar appState="idle" workingDirectory="/home/user/project" />
    );
    expect(lastFrame()!).toContain("/home/user/project");
  });

  it("shows idle hints", () => {
    const { lastFrame } = render(<StatusBar appState="idle" />);
    expect(lastFrame()!).toContain("enter: send");
  });

  it("shows thinking hints", () => {
    const { lastFrame } = render(<StatusBar appState="thinking" />);
    expect(lastFrame()!).toContain("waiting for model");
  });

  it("shows streaming hints", () => {
    const { lastFrame } = render(<StatusBar appState="streaming" />);
    expect(lastFrame()!).toContain("streaming response");
  });

  it("shows confirming hints", () => {
    const { lastFrame } = render(<StatusBar appState="confirming" />);
    expect(lastFrame()!).toContain("approve all");
  });

  it("truncates long paths", () => {
    const longPath = "/very/long/path/that/exceeds/thirty/characters/deeply/nested";
    const { lastFrame } = render(
      <StatusBar appState="idle" workingDirectory={longPath} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("...");
    expect(frame).not.toContain(longPath);
  });

  it("renders separator line", () => {
    const { lastFrame } = render(<StatusBar appState="idle" />);
    expect(lastFrame()!).toContain("\u2500");
  });
});
