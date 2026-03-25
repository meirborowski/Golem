#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './app.js';
import { resolveConfig } from './core/config.js';
import { initLogger, logger } from './utils/logger.js';
import { ensureSearxng, cleanupSearxng } from './utils/searxng.js';

const cli = meow(
  `
  Usage
    $ golem [options]

  Options
    --provider, -p   LLM provider (anthropic, openai, google, ollama)
    --model, -m      Model identifier
    --api-key, -k    API key for the provider
    --agent, -a      Agent config name (default: 'default')
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
      agent: { type: 'string', shortFlag: 'a' },
      debug: { type: 'boolean', default: false },
    },
  },
);

// Resolve config with CLI flags as highest priority
const config = resolveConfig({
  provider: cli.flags.provider,
  model: cli.flags.model,
  apiKey: cli.flags.apiKey,
  agent: cli.flags.agent,
  debug: cli.flags.debug,
});

// Initialize debug logger
initLogger(config.debug);

// Suppress AI SDK warnings that would corrupt Ink's terminal output.
// The SDK prints raw JSON and warning text to stdout/stderr which breaks
// the terminal UI. Redirect known noisy patterns to the file logger.
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

const suppressPatterns = [
  'AI SDK Warning',
  '"type":"error"',
  'sequence_number',
];

function shouldSuppress(chunk: unknown): boolean {
  if (typeof chunk !== 'string') return false;
  return suppressPatterns.some((p) => chunk.includes(p));
}

process.stdout.write = (chunk: unknown, ...args: unknown[]): boolean => {
  if (shouldSuppress(chunk)) {
    logger.warn('Suppressed stdout', { text: String(chunk).slice(0, 200) });
    return true;
  }
  return (originalStdoutWrite as (...a: unknown[]) => boolean)(chunk, ...args);
};

process.stderr.write = (chunk: unknown, ...args: unknown[]): boolean => {
  if (shouldSuppress(chunk)) {
    logger.warn('Suppressed stderr', { text: String(chunk).slice(0, 200) });
    return true;
  }
  return (originalStderrWrite as (...a: unknown[]) => boolean)(chunk, ...args);
};

// Start SearXNG container if not already running (non-blocking on failure)
const searxngBaseUrl =
  config.providers.searxng?.baseUrl ?? process.env.SEARXNG_BASE_URL ?? 'http://localhost:8080';
await ensureSearxng(searxngBaseUrl);

// Clean up SearXNG container on exit
// MCP cleanup is handled by McpBridge subscriber via the bus
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
