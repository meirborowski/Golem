# Golem CLI

A provider-agnostic terminal AI coding assistant. Chat with any LLM, read and edit files, search codebases, and run commands — all from your terminal.

[![npm version](https://img.shields.io/npm/v/golem-cli)](https://www.npmjs.com/package/golem-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- **Multi-provider**: Anthropic Claude, OpenAI GPT, Google Gemini, and local Ollama models
- **Built-in tools**: Read, write, edit files; glob and regex search; shell commands; git; memory; todo tracking; multi-edit; patching; renaming; directory trees; code outline; diffing; web search; fetch; and more
- **Rich terminal UI**: Markdown rendering with syntax-highlighted code blocks and streaming responses
- **Session persistence**: Save and load conversations across sessions
- **Context management**: Automatic truncation when conversations exceed the context window
- **Project-aware**: Reads GOLEM.md/CLAUDE.md/README.md into the system prompt and includes remembered context
- **Approval gating**: Dangerous shell commands and non-read-only git operations require user confirmation
- **MCP support**: Connect external tool servers via the Model Context Protocol

## Prerequisites

- Node.js >= 20.0.0
- An API key for at least one provider, or a local Ollama instance

## Installation

```bash
npm install -g golem-cli
```

## Quick Start

```bash
export ANTHROPIC_API_KEY=sk-...

golem                                          # Default (Anthropic Claude)
golem --provider openai --model gpt-4o         # Use OpenAI
golem --provider ollama --model llama3.1       # Use local Ollama
golem --debug                                  # Enable debug logging
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

## Built-in Tools

| Tool | Description |
|------|-------------|
| `readFile` | Read file contents with optional line range |
| `writeFile` | Create or overwrite files |
| `editFile` | Find-and-replace text in files |
| `multiEdit` | Apply multiple replacements in one pass |
| `patch` | Apply unified diffs |
| `listFiles` | Glob-based file discovery |
| `searchFiles` | Regex search across files |
| `bash` | Shell command execution (requires approval) |
| `git` | Git operations with approval gating |
| `memory` | Persist key/value context across sessions |
| `todoManager` | Track multi-step work items |
| `directoryTree` | Show directory structure |
| `codeOutline` | Extract symbols from source files |
| `diffFiles` | Compare files or raw content |
| `rename` | Rename or move files and directories |
| `webSearch` | Search the web via SearXNG |
| `fetchUrl` | Make HTTP requests to URLs |

## Development

```bash
git clone https://github.com/meirborowski/Golem.git
cd Golem
npm install
```

| Script | Description |
|--------|-------------|
| `npm run dev` | Run in development mode (tsx) |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled version |
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
