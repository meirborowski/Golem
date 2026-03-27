export const PROVIDERS = ["openai", "anthropic", "google", "ollama"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface GolemConfig {
  provider: Provider;
  model: string;
  maxContextTokens: number;
}

const DEFAULTS: Omit<GolemConfig, "maxContextTokens"> = {
  provider: "openai",
  model: "gpt-4o",
};

const CONTEXT_LIMITS: Record<string, number> = {
  openai: 128_000,
  anthropic: 200_000,
  google: 1_000_000,
  ollama: 128_000,
};

const API_KEY_ENV: Record<Provider, string | null> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  ollama: null, // No key needed
};

function parseArgs(argv: string[]): Partial<GolemConfig> {
  const result: Partial<GolemConfig> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--provider" && argv[i + 1]) {
      result.provider = argv[++i] as Provider;
    } else if (argv[i] === "--model" && argv[i + 1]) {
      result.model = argv[++i];
    } else if (argv[i] === "--max-context-tokens" && argv[i + 1]) {
      result.maxContextTokens = parseInt(argv[++i], 10);
    }
  }
  return result;
}

function parseEnv(env: Record<string, string | undefined>): Partial<GolemConfig> {
  const result: Partial<GolemConfig> = {};
  if (env.GOLEM_PROVIDER) result.provider = env.GOLEM_PROVIDER as Provider;
  if (env.GOLEM_MODEL) result.model = env.GOLEM_MODEL;
  if (env.GOLEM_MAX_CONTEXT_TOKENS) result.maxContextTokens = parseInt(env.GOLEM_MAX_CONTEXT_TOKENS, 10);
  return result;
}

/**
 * Resolve configuration from CLI args → env vars → defaults.
 * Validates that a supported provider is selected and
 * the required API key is present (except Ollama).
 */
export function resolveConfig(
  argv: string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
): GolemConfig {
  const fromArgs = parseArgs(argv);
  const fromEnv = parseEnv(env);

  const provider = fromArgs.provider ?? fromEnv.provider ?? DEFAULTS.provider;

  const config: GolemConfig = {
    provider,
    model: fromArgs.model ?? fromEnv.model ?? DEFAULTS.model,
    maxContextTokens: fromArgs.maxContextTokens ?? fromEnv.maxContextTokens ?? CONTEXT_LIMITS[provider] ?? 128_000,
  };

  if (!PROVIDERS.includes(config.provider)) {
    throw new Error(
      `Unknown provider "${config.provider}". Supported: ${PROVIDERS.join(", ")}`,
    );
  }

  const keyEnv = API_KEY_ENV[config.provider];
  if (keyEnv && !env[keyEnv]) {
    throw new Error(
      `${keyEnv} environment variable is required for provider "${config.provider}".`,
    );
  }

  return config;
}

/** Display string for the model, e.g. "openai:gpt-4o" */
export function displayModel(config: GolemConfig): string {
  return `${config.provider}:${config.model}`;
}
