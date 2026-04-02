import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { parseGitignore, createIgnoreFilter } from "#tools/gitignore.js";

describe("parseGitignore", () => {
  it("always ignores .git directory", () => {
    const filter = parseGitignore("");
    expect(filter(".git", true)).toBe(true);
    expect(filter(".git/config", false)).toBe(true);
  });

  it("matches simple filename pattern", () => {
    const filter = parseGitignore("node_modules");
    expect(filter("node_modules", true)).toBe(true);
    expect(filter("src/node_modules", true)).toBe(true);
    expect(filter("src/file.ts", false)).toBe(false);
  });

  it("matches glob pattern with wildcard", () => {
    const filter = parseGitignore("*.log");
    expect(filter("app.log", false)).toBe(true);
    expect(filter("logs/error.log", false)).toBe(true);
    expect(filter("app.ts", false)).toBe(false);
  });

  it("matches double-star glob pattern", () => {
    const filter = parseGitignore("**/*.js");
    expect(filter("dist/bundle.js", false)).toBe(true);
    expect(filter("src/deep/nested/file.js", false)).toBe(true);
    expect(filter("file.ts", false)).toBe(false);
  });

  it("handles negation pattern", () => {
    const filter = parseGitignore("*.log\n!important.log");
    expect(filter("app.log", false)).toBe(true);
    expect(filter("important.log", false)).toBe(false);
  });

  it("handles directory-only pattern", () => {
    const filter = parseGitignore("build/");
    expect(filter("build", true)).toBe(true);
    expect(filter("build/output.js", false)).toBe(true);
    // A file named "build" (not directory) at root level should not match dirOnly rule
    // but our filter checks ancestors too, so this depends on isDirectory param
  });

  it("ignores comment lines and blank lines", () => {
    const filter = parseGitignore("# a comment\n\n*.log\n  \n# another comment");
    expect(filter("app.log", false)).toBe(true);
    expect(filter("app.ts", false)).toBe(false);
  });

  it("handles leading slash (anchored to root)", () => {
    const filter = parseGitignore("/dist");
    expect(filter("dist", true)).toBe(true);
    expect(filter("dist/file.js", false)).toBe(true);
  });
});

describe("createIgnoreFilter", () => {
  it("reads .gitignore and filters accordingly", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/.gitignore": "node_modules\n*.log",
    });
    const getFilter = createIgnoreFilter(fs);
    const filter = await getFilter();

    expect(filter("node_modules", true)).toBe(true);
    expect(filter("app.log", false)).toBe(true);
    expect(filter("src/index.ts", false)).toBe(false);
  });

  it("falls back to .git-only filter when no .gitignore exists", async () => {
    const fs = new MemoryFileSystemAdapter({});
    const getFilter = createIgnoreFilter(fs);
    const filter = await getFilter();

    expect(filter(".git", true)).toBe(true);
    expect(filter("node_modules", true)).toBe(false);
  });

  it("caches the result on subsequent calls", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/.gitignore": "*.log",
    });
    const getFilter = createIgnoreFilter(fs);
    const filter1 = await getFilter();
    const filter2 = await getFilter();

    expect(filter1).toBe(filter2);
  });
});
