#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './app.js';
import { resolveConfig } from './core/config.js';
import { listProviders } from './core/provider-registry.js';
import { initLogger } from './utils/logger.js';
import { ensureSearxng, cleanupSearxng } from './utils/searxng.js';

const cli = meow(
  `
  Usage
    $ golem [options]

  Options
    --provider, -p   LLM provider (${listProviders().join(', ')})
    --model, -m      Model identifier
    --api-key, -k    API key for the provider
    --debug          Enable debug logging
    --version, -v    Show version
    --help, -h       Show help

  Examples
    $ golem
    $ golem --provider openai --model gpt-4o
    $ golem --provider ollama --model llama3.1
`,
  {
    importMeta: import.meta,
    flags: {
      provider: { type: 'string', shortFlag: 'p' },
      model: { type: 'string', shortFlag: 'm' },
      apiKey: { type: 'string', shortFlag: 'k' },
      debug: { type: 'boolean', default: false },
    },
  },
);

// Resolve config with CLI flags as highest priority
const config = resolveConfig({
  provider: cli.flags.provider,
  model: cli.flags.model,
  apiKey: cli.flags.apiKey,
  debug: cli.flags.debug,
});

// Initialize debug logger
initLogger(config.debug);

// Start SearXNG container if not already running (non-blocking on failure)
const searxngBaseUrl =
  config.providers.searxng?.baseUrl ?? process.env.SEARXNG_BASE_URL ?? 'http://localhost:8080';
await ensureSearxng(searxngBaseUrl);

// Clean up SearXNG container on exit
process.on('exit', cleanupSearxng);
process.on('SIGINT', () => {
  cleanupSearxng();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanupSearxng();
  process.exit(0);
});

// Render the Ink app
render(<App config={config} />, {
  patchConsole: false,
});
