import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";

describe("MemoryFileSystemAdapter", () => {
  it("reads and writes files", async () => {
    const fs = new MemoryFileSystemAdapter();
    await fs.writeFile("/hello.txt", "world");
    expect(await fs.readFile("/hello.txt")).toBe("world");
  });

  it("throws on reading non-existent file", async () => {
    const fs = new MemoryFileSystemAdapter();
    await expect(fs.readFile("/missing.txt")).rejects.toThrow("File not found");
  });

  it("initializes with files", async () => {
    const fs = new MemoryFileSystemAdapter({ "/a.txt": "aaa", "/b.txt": "bbb" });
    expect(await fs.readFile("/a.txt")).toBe("aaa");
    expect(await fs.readFile("/b.txt")).toBe("bbb");
  });

  it("overwrites existing files", async () => {
    const fs = new MemoryFileSystemAdapter({ "/f.txt": "old" });
    await fs.writeFile("/f.txt", "new");
    expect(await fs.readFile("/f.txt")).toBe("new");
  });

  it("deletes files", async () => {
    const fs = new MemoryFileSystemAdapter({ "/f.txt": "data" });
    await fs.deleteFile("/f.txt");
    expect(await fs.exists("/f.txt")).toBe(false);
  });

  it("throws on deleting non-existent file", async () => {
    const fs = new MemoryFileSystemAdapter();
    await expect(fs.deleteFile("/missing.txt")).rejects.toThrow("File not found");
  });

  it("checks existence of files and directories", async () => {
    const fs = new MemoryFileSystemAdapter({ "/dir/file.txt": "content" });
    expect(await fs.exists("/dir/file.txt")).toBe(true);
    expect(await fs.exists("/dir")).toBe(true);
    expect(await fs.exists("/missing")).toBe(false);
  });

  it("lists directory contents non-recursively", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "a",
      "/src/b.ts": "b",
      "/src/sub/c.ts": "c",
    });
    const entries = await fs.listDirectory("/src");
    const paths = entries.filter(e => !e.isDirectory).map(e => e.path);
    expect(paths).toEqual(expect.arrayContaining(["/src/a.ts", "/src/b.ts"]));
    expect(paths).not.toContain("/src/sub/c.ts");
  });

  it("lists directory contents recursively", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "a",
      "/src/sub/b.ts": "b",
    });
    const entries = await fs.listDirectory("/src", true);
    const paths = entries.filter(e => !e.isDirectory).map(e => e.path);
    expect(paths).toEqual(expect.arrayContaining(["/src/a.ts", "/src/sub/b.ts"]));
  });

  it("returns stat for files and directories", async () => {
    const fs = new MemoryFileSystemAdapter({ "/dir/file.txt": "hello" });
    const fileStat = await fs.stat("/dir/file.txt");
    expect(fileStat.isDirectory).toBe(false);
    expect(fileStat.size).toBe(5);

    const dirStat = await fs.stat("/dir");
    expect(dirStat.isDirectory).toBe(true);
  });

  it("creates directories with mkdir", async () => {
    const fs = new MemoryFileSystemAdapter();
    await fs.mkdir("/a/b/c");
    expect(await fs.exists("/a")).toBe(true);
    expect(await fs.exists("/a/b")).toBe(true);
    expect(await fs.exists("/a/b/c")).toBe(true);
  });
});
