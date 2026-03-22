# Golem CLI

A provider-agnostic terminal AI coding assistant. Chat with any LLM, read and edit files, search codebases, and run commands — all from your terminal.

## Features

- **Multi-provider**: Anthropic Claude, OpenAI GPT, Google Gemini, and local Ollama models
- **Built-in tools**: Read, write, edit files, glob search, regex search, shell commands, git, memory, todo tracking, multi-edit, patching, renaming, directory trees, code outline, diffing, web search, fetch, and more
- **Rich terminal UI**: Markdown rendering with syntax-highlighted code blocks, streaming responses
- **Session persistence**: Save and load conversations across sessions
- **Context management**: Automatic truncation when conversations exceed the context window
- **Project-aware**: Reads GOLEM.md/CLAUDE.md/README.md into the system prompt and includes remembered context
- **Approval gating**: Dangerous shell commands and non-read-only git operations require user confirmation

## Project Guide

If you’re using Golem inside this repo, read [GOLEM.md](GOLEM.md) for the project-specific architecture, conventions, and agent rules.

## Prerequisites

- Node.js >= 20.0.0
- An API key for at least one provider (or a local Ollama instance)

## Installation

### Install from npm

```bash
npm install -g golem-cli
```

This installs the `golem` command globally.

### Develop from source

```bash
git clone <repository-url>
cd golem-cli
npm install
```

## Usage

```bash
# Development mode
npm run dev

# With a specific provider and model
npm run dev -- --provider openai --model gpt-4o
npm run dev -- --provider anthropic --model claude-sonnet-4-20250514
npm run dev -- --provider ollama --model llama3.1

# Debug logging
npm run dev -- --debug
```

Set your API key as an environment variable:

```bash
export ANTHROPIC_API_KEY=sk-...
export OPENAI_API_KEY=sk-...
export GOOGLE_GENERATIVE_AI_API_KEY=...
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear conversation history |
| `/save` | Save current session |
| `/load [id]` | Load a saved session |
| `/history` | List saved sessions |
| `/model` | Show current model |
| `/provider` | Show current provider |
| `/exit`, `/quit` | Exit Golem |

## Input Modes

- **Single-line** (default): Type and press Enter to send
- **Multi-line**: Press `Ctrl+J` to toggle. Enter adds newlines, `Ctrl+Enter` sends

## Configuration

Golem uses layered configuration (later overrides earlier):

1. Built-in defaults
2. Global config: `~/.config/golem/config.json`
3. Project config: `.golem/config.json`
4. Environment variables: `GOLEM_PROVIDER`, `GOLEM_MODEL`, provider API keys
5. CLI flags: `--provider`, `--model`, `--debug`

Example config:

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "maxTokens": 4096,
  "contextWindow": 128000,
  "temperature": 0.7,
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/api"
    }
  }
}
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run in development mode (tsx) |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled version |
| `npm install -g golem-cli` | Install the CLI globally from npm |
| `npm test` | Run tests via Vitest |
| `npm run typecheck` | Type-check without emitting |
| `npm run format` | Format with Prettier |

## Architecture

```text
src/
  core/          Config, conversation engine, providers, sessions, types
  tools/         Built-in tools and tool registry
  ui/            Ink components, hooks, context
  utils/         File I/O, logging, project detection
```

See [CLAUDE.md](CLAUDE.md) for detailed architecture and contribution guide.

## License

MIT
