# Golem CLI

A provider-agnostic terminal AI coding assistant. Chat with any LLM, read and edit files, search codebases, and run commands — all from your terminal.

## Features

- **Multi-provider**: Anthropic Claude, OpenAI GPT, Google Gemini, and local Ollama models
- **Built-in tools**: Read, write, edit files, glob search, regex search, shell commands
- **Rich terminal UI**: Markdown rendering with syntax-highlighted code blocks, streaming responses
- **Session persistence**: Save and load conversations across sessions
- **Context management**: Automatic truncation when conversations exceed the context window
- **Bash approval**: Dangerous commands require user confirmation before execution
- **Project-aware**: Reads GOLEM.md/CLAUDE.md/README.md into the system prompt

## Prerequisites

- Node.js >= 20.0.0
- An API key for at least one provider (or a local Ollama instance)

## Installation

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
| `/exit` | Exit Golem |

## Input Modes

- **Single-line** (default): Type and press Enter to send
- **Multi-line**: Press `Ctrl+J` to toggle. Enter adds newlines, `Ctrl+Enter` sends

## Configuration

Golem uses layered configuration (later overrides earlier):

1. Built-in defaults
2. Global config: `~/.config/golem/config.json`
3. Project config: `.golem/config.json`
4. Environment variables: `GOLEM_PROVIDER`, `GOLEM_MODEL`
5. CLI flags: `--provider`, `--model`, `--debug`

Example config:

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "maxTokens": 4096,
  "contextWindow": 128000
}
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run in development mode (tsx) |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled version |
| `npm test` | Run tests (71 tests via Vitest) |
| `npm run typecheck` | Type-check without emitting |
| `npm run format` | Format with Prettier |

## Architecture

```
src/
  core/          Config, conversation engine, providers, sessions, types
  tools/         Built-in tools (read, write, edit, list, search, bash)
  ui/            Ink components, hooks, context
  utils/         File I/O, logging, project detection
```

See [CLAUDE.md](CLAUDE.md) for detailed architecture and contribution guide.

## License

MIT
