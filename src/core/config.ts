import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { GolemConfig, ResolvedConfig } from './types.js';

const DEFAULTS: ResolvedConfig = {
  provider: 'anthropic',
  model: '',
  maxTokens: 4096,
  contextWindow: 128_000, // sensible default; most modern models support 128k
  temperature: undefined, // omitted by default; reasoning models don't support it
  debug: false,
  cwd: process.cwd(),
  providers: {},
  mcpServers: {},
};

const CONFIG_FILENAME = 'config.json';
const PROJECT_DIR = '.golem';

function loadJsonFile(filePath: string): Partial<GolemConfig> | null {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Partial<GolemConfig>;
  } catch {
    return null;
  }
}

function findGlobalConfigPath(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  if (xdg) return join(xdg, 'golem', CONFIG_FILENAME);

  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'];
    if (appData) return join(appData, 'golem', CONFIG_FILENAME);
  }

  return join(homedir(), '.config', 'golem', CONFIG_FILENAME);
}

function findProjectConfig(startDir: string): Partial<GolemConfig> | null {
  let dir = resolve(startDir);
  const root = dirname(dir) === dir ? dir : undefined;

  while (true) {
    const configPath = join(dir, PROJECT_DIR, CONFIG_FILENAME);
    const config = loadJsonFile(configPath);
    if (config) return config;

    const parent = dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }

  return null;
}

function loadEnvConfig(): Partial<GolemConfig> {
  const config: Partial<GolemConfig> = {};

  if (process.env['GOLEM_PROVIDER']) config.provider = process.env['GOLEM_PROVIDER'];
  if (process.env['GOLEM_MODEL']) config.model = process.env['GOLEM_MODEL'];
  if (process.env['GOLEM_DEBUG'] === 'true') config.debug = true;

  return config;
}

export interface CliArgs {
  provider?: string;
  model?: string;
  apiKey?: string;
  agent?: string;
  debug?: boolean;
}

export function resolveConfig(cliArgs: CliArgs = {}): ResolvedConfig {
  // Layer 1: Defaults
  let config: ResolvedConfig = { ...DEFAULTS };

  // Layer 2: Global config file
  const globalPath = findGlobalConfigPath();
  const globalConfig = loadJsonFile(globalPath);
  if (globalConfig) {
    config = mergeConfig(config, globalConfig);
  }

  // Layer 3: Project config (walk up from cwd)
  const projectConfig = findProjectConfig(process.cwd());
  if (projectConfig) {
    config = mergeConfig(config, projectConfig);
  }

  // Layer 4: Environment variables
  const envConfig = loadEnvConfig();
  config = mergeConfig(config, envConfig);

  // Layer 5: CLI arguments (highest priority)
  if (cliArgs.provider) config.provider = cliArgs.provider;
  if (cliArgs.model) config.model = cliArgs.model;
  if (cliArgs.apiKey) config.apiKey = cliArgs.apiKey;
  if (cliArgs.agent) config.agent = cliArgs.agent;
  if (cliArgs.debug !== undefined) config.debug = cliArgs.debug;

  // Resolve cwd
  config.cwd = process.cwd();

  return config;
}

function mergeConfig(base: ResolvedConfig, override: Partial<GolemConfig>): ResolvedConfig {
  return {
    ...base,
    ...(override.provider !== undefined && { provider: override.provider }),
    ...(override.model !== undefined && { model: override.model }),
    ...(override.apiKey !== undefined && { apiKey: override.apiKey }),
    ...(override.maxTokens !== undefined && { maxTokens: override.maxTokens }),
    ...(override.contextWindow !== undefined && { contextWindow: override.contextWindow }),
    ...(override.temperature !== undefined && { temperature: override.temperature }),
    ...(override.debug !== undefined && { debug: override.debug }),
    providers: {
      ...base.providers,
      ...(override.providers ?? {}),
    },
    mcpServers: {
      ...base.mcpServers,
      ...(override.mcpServers ?? {}),
    },
  };
}
