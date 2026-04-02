// Model pricing in dollars per 1M tokens
export interface ModelPricing {
  input: number;
  output: number;
}

// Pricing map keyed by "provider:model-prefix"
// Uses prefix matching so "gpt-4o-2024-08-06" matches "gpt-4o"
const PRICING: Record<string, Record<string, ModelPricing>> = {
  openai: {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-4-turbo": { input: 10, output: 30 },
    "gpt-4.1-mini": { input: 0.4, output: 1.6 },
    "gpt-4.1-nano": { input: 0.1, output: 0.4 },
    "gpt-4.1": { input: 2, output: 8 },
    "o4-mini": { input: 1.1, output: 4.4 },
    "o3-mini": { input: 1.1, output: 4.4 },
    "o3": { input: 10, output: 40 },
    "o1-mini": { input: 3, output: 12 },
    "o1": { input: 15, output: 60 },
  },
  anthropic: {
    "claude-sonnet-4": { input: 3, output: 15 },
    "claude-opus-4": { input: 15, output: 75 },
    "claude-3-7-sonnet": { input: 3, output: 15 },
    "claude-3-5-sonnet": { input: 3, output: 15 },
    "claude-3-5-haiku": { input: 0.8, output: 4 },
    "claude-3-opus": { input: 15, output: 75 },
    "claude-3-haiku": { input: 0.25, output: 1.25 },
  },
  google: {
    "gemini-2.5-pro": { input: 1.25, output: 10 },
    "gemini-2.5-flash": { input: 0.15, output: 0.6 },
    "gemini-2.0-flash": { input: 0.1, output: 0.4 },
    "gemini-1.5-pro": { input: 1.25, output: 5 },
    "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  },
  ollama: {},
};

export function lookupPricing(provider: string, model: string): ModelPricing | null {
  const providerPricing = PRICING[provider];
  if (!providerPricing) return null;

  // Exact match first
  if (providerPricing[model]) return providerPricing[model];

  // Prefix match — sort by key length descending so longer (more specific) prefixes win
  const keys = Object.keys(providerPricing).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (model.startsWith(key)) return providerPricing[key];
  }

  return null;
}

export function calculateCost(inputTokens: number, outputTokens: number, pricing: ModelPricing): number {
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return (tokens / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return (tokens / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}
