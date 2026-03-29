import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { ChangeConfirmation } from "#adapters/ui/ink/components/ChangeConfirmation.js";
import type { FileChange } from "#core/entities/FileChange.js";

describe("ChangeConfirmation", () => {
  const changes: FileChange[] = [
    { filePath: "/src/a.ts", operation: "create", newContent: "code" },
    { filePath: "/src/b.ts", operation: "modify", originalContent: "old", newContent: "new" },
  ];

  it("renders pending changes header", () => {
    const { lastFrame } = render(
      <ChangeConfirmation changes={changes} onConfirm={() => {}} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Pending Changes");
    expect(frame).toContain("2 files");
  });

  it("shows overview mode keyboard hints", () => {
    const { lastFrame } = render(
      <ChangeConfirmation changes={changes} onConfirm={() => {}} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("y approve all");
    expect(frame).toContain("n reject");
    expect(frame).toContain("s select");
  });

  it("renders file paths from changes", () => {
    const { lastFrame } = render(
      <ChangeConfirmation changes={changes} onConfirm={() => {}} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain("/src/a.ts");
    expect(frame).toContain("/src/b.ts");
  });

  it("j key moves focus down to second file", async () => {
    const { lastFrame, stdin } = render(
      <ChangeConfirmation changes={changes} onConfirm={() => {}} />
    );
    // Initially first file has ▶
    let frame = lastFrame()!;
    const lines = frame.split("\n");
    const aLine = lines.find((l) => l.includes("/src/a.ts"));
    const bLine = lines.find((l) => l.includes("/src/b.ts"));
    expect(aLine).toContain("▶");
    expect(bLine).not.toContain("▶");

    // Press j to move down
    stdin.write("j");
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame()!;
    const lines2 = frame.split("\n");
    const aLine2 = lines2.find((l) => l.includes("/src/a.ts"));
    const bLine2 = lines2.find((l) => l.includes("/src/b.ts"));
    expect(aLine2).not.toContain("▶");
    expect(bLine2).toContain("▶");
  });

  it("y key approves all changes", async () => {
    const onConfirm = vi.fn();
    const { stdin } = render(
      <ChangeConfirmation changes={changes} onConfirm={onConfirm} />
    );
    stdin.write("y");
    await new Promise((r) => setTimeout(r, 50));
    expect(onConfirm).toHaveBeenCalledWith(changes);
  });

  it("n key rejects all changes", async () => {
    const onConfirm = vi.fn();
    const { stdin } = render(
      <ChangeConfirmation changes={changes} onConfirm={onConfirm} />
    );
    stdin.write("n");
    await new Promise((r) => setTimeout(r, 50));
    expect(onConfirm).toHaveBeenCalledWith([]);
  });
});
