import { describe, it, expect } from "vitest";
import { resolveConfig, displayModel, PROVIDERS } from "#core/config.js";

describe("resolveConfig", () => {
  const baseEnv = { OPENAI_API_KEY: "sk-test" };

  it("returns defaults when no args or env vars", () => {
    const config = resolveConfig([], baseEnv);
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o");
  });

  it("reads provider and model from env vars", () => {
    const config = resolveConfig([], {
      GOLEM_PROVIDER: "anthropic",
      GOLEM_MODEL: "claude-sonnet-4-20250514",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe("claude-sonnet-4-20250514");
  });

  it("CLI args override env vars", () => {
    const config = resolveConfig(
      ["node", "index.js", "--provider", "google", "--model", "gemini-2.0-flash"],
      {
        GOLEM_PROVIDER: "openai",
        GOLEM_MODEL: "gpt-4o",
        GOOGLE_GENERATIVE_AI_API_KEY: "gk-test",
      },
    );
    expect(config.provider).toBe("google");
    expect(config.model).toBe("gemini-2.0-flash");
  });

  it("throws on unknown provider", () => {
    expect(() => resolveConfig(["--provider", "unknown"], baseEnv)).toThrow(
      "Unknown provider",
    );
  });

  it("throws when required API key is missing", () => {
    expect(() => resolveConfig(["--provider", "anthropic"], {})).toThrow(
      "ANTHROPIC_API_KEY",
    );
  });

  it("does not require API key for ollama", () => {
    const config = resolveConfig(["--provider", "ollama", "--model", "llama3"], {});
    expect(config.provider).toBe("ollama");
    expect(config.model).toBe("llama3");
  });

  it("partial CLI args merge with env and defaults", () => {
    const config = resolveConfig(
      ["--model", "gpt-4o-mini"],
      { OPENAI_API_KEY: "sk-test" },
    );
    expect(config.provider).toBe("openai"); // default
    expect(config.model).toBe("gpt-4o-mini"); // from CLI
  });
});

describe("displayModel", () => {
  it("formats provider:model", () => {
    expect(displayModel({ provider: "openai", model: "gpt-4o" })).toBe("openai:gpt-4o");
    expect(displayModel({ provider: "anthropic", model: "claude-sonnet-4-20250514" })).toBe(
      "anthropic:claude-sonnet-4-20250514",
    );
  });
});

describe("PROVIDERS", () => {
  it("includes all four providers", () => {
    expect(PROVIDERS).toContain("openai");
    expect(PROVIDERS).toContain("anthropic");
    expect(PROVIDERS).toContain("google");
    expect(PROVIDERS).toContain("ollama");
  });
});
