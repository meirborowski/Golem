# Golem CLI

Golem is a provider-agnostic terminal AI coding assistant. It can chat with multiple LLMs, read and edit files, search codebases, run commands, and manage multi-turn agent tasks from your terminal.

[![npm version](https://img.shields.io/npm/v/golem-cli)](https://www.npmjs.com/package/golem-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- **Multi-provider**: Anthropic Claude, OpenAI GPT, Google Gemini, and local Ollama models
- **Extensible architecture**: Built-in providers, tools, commands, and prompt sections are loaded through an extension registry
- **Built-in tools**: Read, write, edit files; glob and regex search; shell commands; git; memory; todo tracking; multi-edit; patching; renaming; directory trees; code outline; diffing; web search; fetch; and more
- **Agent mode**: Multi-turn task execution with automatic continuation, tool chaining, and `agentDone` completion
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

Golem uses layered configuration, with later sources overriding earlier ones:

1. Built-in defaults
2. Global config: `~/.config/golem/config.json` (or `%APPDATA%\\golem\\config.json` on Windows)
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

| Tool | File | Description |
|------|------|-------------|
| `readFile` | `src/tools/read-file.ts` | Read file contents with optional line range |
| `writeFile` | `src/tools/write-file.ts` | Create or overwrite files |
| `editFile` | `src/tools/edit-file.ts` | Find-and-replace text in files |
| `listFiles` | `src/tools/list-files.ts` | Glob-based file discovery |
| `searchFiles` | `src/tools/search-files.ts` | Regex search across files |
| `bash` | `src/tools/bash.ts` | Shell command execution (requires approval) |
| `git` | `src/tools/git.ts` | Git operations with approval gating |
| `memory` | `src/tools/memory.ts` | Persist key/value context across sessions |
| `todoManager` | `src/tools/todo-manager.ts` | Track multi-step work items |
| `multiEdit` | `src/tools/multi-edit.ts` | Apply multiple replacements in one pass |
| `patch` | `src/tools/patch.ts` | Apply unified diffs |
| `rename` | `src/tools/rename.ts` | Rename or move files and directories |
| `directoryTree` | `src/tools/directory-tree.ts` | Show directory structure |
| `codeOutline` | `src/tools/code-outline.ts` | Extract symbols from source files |
| `diffFiles` | `src/tools/diff-files.ts` | Compare files or raw content |
| `webSearch` | `src/tools/web-search.ts` | Search the web via SearXNG |
| `fetchUrl` | `src/tools/fetch.ts` | Make HTTP requests to URLs |
| `think` | `src/tools/think.ts` | Private scratchpad for planning |
| `agentDone` | `src/tools/agent-done.ts` | Mark a task as completed |

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
| `npm test` | Run Vitest tests |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Check formatting with Prettier |
| `npm run format` | Format with Prettier |

## Architecture

```text
src/
  core/          Config, conversation engine, providers, sessions, extensions, middleware, types
  extensions/    Built-in extensions for commands, providers, tools, and prompt sections
  tools/         Built-in tools
  tools/         Built-in tools and tool registry
  ui/            Ink components, hooks, context
  utils/         File I/O, logging, project detection
```

See [GOLEM.md](GOLEM.md) for the repository guide and agent conventions.

## License

MIT
