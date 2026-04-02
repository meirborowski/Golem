import { describe, it, expect } from "vitest";
import { lookupPricing, calculateCost, formatTokenCount, formatCost } from "#core/pricing.js";

describe("lookupPricing", () => {
  it("returns exact match pricing", () => {
    const pricing = lookupPricing("openai", "gpt-4o");
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBe(2.5);
    expect(pricing!.output).toBe(10);
  });

  it("returns prefix match for versioned models", () => {
    const pricing = lookupPricing("openai", "gpt-4o-2024-08-06");
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBe(2.5);
  });

  it("prefers longer prefix (gpt-4o-mini over gpt-4o)", () => {
    const pricing = lookupPricing("openai", "gpt-4o-mini-2024-07-18");
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBe(0.15);
  });

  it("returns null for unknown provider", () => {
    expect(lookupPricing("mistral", "mistral-large")).toBeNull();
  });

  it("returns null for unknown model", () => {
    expect(lookupPricing("openai", "gpt-99")).toBeNull();
  });

  it("returns null for ollama (free)", () => {
    expect(lookupPricing("ollama", "llama3")).toBeNull();
  });

  it("finds anthropic models", () => {
    const pricing = lookupPricing("anthropic", "claude-sonnet-4-20250514");
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBe(3);
  });

  it("finds google models", () => {
    const pricing = lookupPricing("google", "gemini-2.5-pro-latest");
    expect(pricing).not.toBeNull();
    expect(pricing!.input).toBe(1.25);
  });
});

describe("calculateCost", () => {
  it("calculates cost correctly", () => {
    const cost = calculateCost(1_000_000, 500_000, { input: 3, output: 15 });
    // 1M * $3/1M + 500k * $15/1M = $3 + $7.5 = $10.5
    expect(cost).toBeCloseTo(10.5);
  });

  it("returns 0 for zero tokens", () => {
    expect(calculateCost(0, 0, { input: 3, output: 15 })).toBe(0);
  });
});

describe("formatTokenCount", () => {
  it("formats small numbers as-is", () => {
    expect(formatTokenCount(500)).toBe("500");
  });

  it("formats thousands with k suffix", () => {
    expect(formatTokenCount(1500)).toBe("1.5k");
  });

  it("drops trailing .0 for clean thousands", () => {
    expect(formatTokenCount(2000)).toBe("2k");
  });

  it("formats millions with M suffix", () => {
    expect(formatTokenCount(1_500_000)).toBe("1.5M");
  });
});

describe("formatCost", () => {
  it("formats tiny costs with 4 decimal places", () => {
    expect(formatCost(0.0012)).toBe("$0.0012");
  });

  it("formats small costs with 3 decimal places", () => {
    expect(formatCost(0.05)).toBe("$0.050");
  });

  it("formats large costs with 2 decimal places", () => {
    expect(formatCost(1.5)).toBe("$1.50");
  });
});
