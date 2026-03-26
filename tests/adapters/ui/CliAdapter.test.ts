import { describe, it, expect } from "vitest";
import { MockUserInterface } from "../../mocks/MockUserInterface.js";
import type { FileChange } from "#core/entities/FileChange.js";

describe("IUserInterface contract (via MockUserInterface)", () => {
  it("returns scripted inputs in order", async () => {
    const ui = new MockUserInterface(["hello", "world"]);
    expect(await ui.prompt()).toBe("hello");
    expect(await ui.prompt()).toBe("world");
  });

  it("returns 'exit' when inputs exhausted", async () => {
    const ui = new MockUserInterface([]);
    expect(await ui.prompt()).toBe("exit");
  });

  it("captures displayed messages", () => {
    const ui = new MockUserInterface();
    ui.display("msg1");
    ui.display("msg2");
    expect(ui.displayed).toEqual(["msg1", "msg2"]);
  });

  it("captures streamed chunks", () => {
    const ui = new MockUserInterface();
    ui.displayStream("a");
    ui.displayStream("b");
    expect(ui.streamedChunks).toEqual(["a", "b"]);
  });

  it("captures errors", () => {
    const ui = new MockUserInterface();
    ui.displayError("oops");
    expect(ui.errors).toEqual(["oops"]);
  });

  it("approves all changes when configured", async () => {
    const ui = new MockUserInterface([], true);
    const changes: FileChange[] = [
      { filePath: "/a.ts", operation: "create", newContent: "code" },
    ];
    expect(await ui.confirmChanges(changes)).toEqual(changes);
  });

  it("rejects all changes when configured", async () => {
    const ui = new MockUserInterface([], false);
    const changes: FileChange[] = [
      { filePath: "/a.ts", operation: "create", newContent: "code" },
    ];
    expect(await ui.confirmChanges(changes)).toEqual([]);
  });
});
