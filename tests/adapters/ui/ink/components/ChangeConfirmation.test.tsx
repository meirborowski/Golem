import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { ChangeConfirmation } from "../../../../../src/adapters/ui/ink/components/ChangeConfirmation.js";
import type { FileChange } from "../../../../../src/core/entities/FileChange.js";

describe("ChangeConfirmation", () => {
  const changes: FileChange[] = [
    { filePath: "/src/a.ts", operation: "create", newContent: "code" },
    { filePath: "/src/b.ts", operation: "modify", originalContent: "old", newContent: "new" },
  ];

  it("renders pending changes header", () => {
    const { lastFrame } = render(
      <ChangeConfirmation changes={changes} onConfirm={() => {}} />
    );
    expect(lastFrame()!).toContain("2 pending change(s)");
  });

  it("shows overview mode keyboard hints", () => {
    const { lastFrame } = render(
      <ChangeConfirmation changes={changes} onConfirm={() => {}} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("[y]");
    expect(frame).toContain("[n]");
    expect(frame).toContain("[s]");
  });

  it("renders file paths from changes", () => {
    const { lastFrame } = render(
      <ChangeConfirmation changes={changes} onConfirm={() => {}} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("/src/a.ts");
    expect(frame).toContain("/src/b.ts");
  });
});
