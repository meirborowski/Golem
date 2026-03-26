import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { DiffView } from "#adapters/ui/ink/components/DiffView.js";
import type { FileChange } from "#core/entities/FileChange.js";

describe("DiffView", () => {
  it("renders DELETE label for delete operations", () => {
    const change: FileChange = { filePath: "/src/old.ts", operation: "delete" };
    const { lastFrame } = render(<DiffView change={change} />);
    expect(lastFrame()!).toContain("[DELETE]");
    expect(lastFrame()!).toContain("/src/old.ts");
  });

  it("renders CREATE label and + lines for create operations", () => {
    const change: FileChange = {
      filePath: "/src/new.ts",
      operation: "create",
      newContent: "const x = 1;\nconst y = 2;",
    };
    const { lastFrame } = render(<DiffView change={change} />);
    const frame = lastFrame()!;
    expect(frame).toContain("[CREATE]");
    expect(frame).toContain("+ const x = 1;");
    expect(frame).toContain("+ const y = 2;");
  });

  it("renders MODIFY label with unified diff", () => {
    const change: FileChange = {
      filePath: "/src/index.ts",
      operation: "modify",
      originalContent: "const a = 1;",
      newContent: "const a = 2;",
    };
    const { lastFrame } = render(<DiffView change={change} />);
    const frame = lastFrame()!;
    expect(frame).toContain("[MODIFY]");
    expect(frame).toContain("/src/index.ts");
  });

  it("truncates long create content", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const change: FileChange = {
      filePath: "/src/big.ts",
      operation: "create",
      newContent: lines,
    };
    const { lastFrame } = render(<DiffView change={change} />);
    expect(lastFrame()!).toContain("more lines");
  });
});
