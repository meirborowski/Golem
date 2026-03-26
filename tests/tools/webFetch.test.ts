import { describe, it, expect, vi } from "vitest";
import { createWebFetchTool } from "#tools/webFetch.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("webFetch tool", () => {
  it("fetches text content from a URL", async () => {
    const mockResponse = new Response("Hello World", {
      headers: { "content-type": "text/plain" },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const tool = createWebFetchTool();
    const result = await exec(tool, { url: "https://example.com/test.txt" });
    expect(result).toBe("Hello World");

    vi.restoreAllMocks();
  });

  it("strips HTML tags from HTML content", async () => {
    const mockResponse = new Response("<html><body><p>Hello</p><script>bad();</script></body></html>", {
      headers: { "content-type": "text/html" },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const tool = createWebFetchTool();
    const result = await exec(tool, { url: "https://example.com" });
    expect(result).toContain("Hello");
    expect(result).not.toContain("<p>");
    expect(result).not.toContain("bad()");

    vi.restoreAllMocks();
  });

  it("reports HTTP errors", async () => {
    const mockResponse = new Response("", { status: 404, statusText: "Not Found" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const tool = createWebFetchTool();
    const result = await exec(tool, { url: "https://example.com/nope" });
    expect(result).toContain("404");

    vi.restoreAllMocks();
  });

  it("truncates long content", async () => {
    const longContent = "x".repeat(30000);
    const mockResponse = new Response(longContent, {
      headers: { "content-type": "text/plain" },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const tool = createWebFetchTool();
    const result = await exec(tool, { url: "https://example.com/big" });
    expect(result).toContain("truncated");
    expect(result.length).toBeLessThan(longContent.length);

    vi.restoreAllMocks();
  });
});
