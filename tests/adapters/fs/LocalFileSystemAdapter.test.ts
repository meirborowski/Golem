import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { LocalFileSystemAdapter } from "../../../src/adapters/fs/LocalFileSystemAdapter.js";

let tmpDir: string;
let adapter: LocalFileSystemAdapter;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "golem-test-"));
  adapter = new LocalFileSystemAdapter(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("LocalFileSystemAdapter", () => {
  it("writes and reads a file", async () => {
    await adapter.writeFile("hello.txt", "world");
    expect(await adapter.readFile("hello.txt")).toBe("world");
  });

  it("creates parent directories on write", async () => {
    await adapter.writeFile("a/b/c.txt", "deep");
    expect(await adapter.readFile("a/b/c.txt")).toBe("deep");
  });

  it("deletes a file", async () => {
    await adapter.writeFile("temp.txt", "data");
    await adapter.deleteFile("temp.txt");
    expect(await adapter.exists("temp.txt")).toBe(false);
  });

  it("checks existence", async () => {
    expect(await adapter.exists("nope.txt")).toBe(false);
    await adapter.writeFile("yes.txt", "hi");
    expect(await adapter.exists("yes.txt")).toBe(true);
  });

  it("lists directory non-recursively", async () => {
    await adapter.writeFile("a.txt", "a");
    await adapter.writeFile("b.txt", "b");
    await adapter.writeFile("sub/c.txt", "c");

    const entries = await adapter.listDirectory(".");
    const names = entries.map(e => e.path);
    expect(names).toContain("a.txt");
    expect(names).toContain("b.txt");
    expect(names).toContain("sub");
    expect(names).not.toContain("sub/c.txt");
  });

  it("returns stat for a file", async () => {
    await adapter.writeFile("f.txt", "hello");
    const info = await adapter.stat("f.txt");
    expect(info.isDirectory).toBe(false);
    expect(info.size).toBe(5);
  });

  it("creates directories with mkdir", async () => {
    await adapter.mkdir("x/y/z");
    expect(await adapter.exists("x/y/z")).toBe(true);
  });

  it("rejects path traversal", async () => {
    await expect(adapter.readFile("../../etc/passwd")).rejects.toThrow("Path traversal");
  });
});
