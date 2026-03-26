import { describe, it, expect } from "vitest";
import { createModel } from "#core/createModel.js";
import type { GolemConfig } from "#core/config.js";

describe("createModel", () => {
  it("creates an openai model", () => {
    const config: GolemConfig = { provider: "openai", model: "gpt-4o" };
    const model = createModel(config);
    expect(model).toBeDefined();
    expect(model.modelId).toContain("gpt-4o");
  });

  it("creates an anthropic model", () => {
    const config: GolemConfig = { provider: "anthropic", model: "claude-sonnet-4-20250514" };
    const model = createModel(config);
    expect(model).toBeDefined();
    expect(model.modelId).toContain("claude");
  });

  it("creates a google model", () => {
    const config: GolemConfig = { provider: "google", model: "gemini-2.0-flash" };
    const model = createModel(config);
    expect(model).toBeDefined();
  });

  it("creates an ollama model", () => {
    const config: GolemConfig = { provider: "ollama", model: "llama3" };
    const model = createModel(config);
    expect(model).toBeDefined();
  });

  it("throws on unsupported provider", () => {
    const config = { provider: "fake", model: "x" } as GolemConfig;
    expect(() => createModel(config)).toThrow("Unsupported provider");
  });
});
