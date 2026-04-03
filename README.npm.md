# Golem

A modular, provider-agnostic coding agent for vibe coding. Built on the [Vercel AI SDK](https://sdk.vercel.ai/) with Hexagonal Architecture.

Golem reads your intent, gathers context from your codebase, calls an LLM with tools, and applies changes with human approval before any writes hit disk.

## Install

```bash
npm install -g golem
```

## Setup

Set an API key for your preferred provider:

```bash
# OpenAI (default)
export OPENAI_API_KEY=your-key

# Or use another provider
export GOLEM_PROVIDER=anthropic
export ANTHROPIC_API_KEY=your-key
```

Supported providers: **OpenAI**, **Anthropic**, **Google**, **Ollama** (local).

## Usage

```bash
golem
```

Then type a request. Golem will select the best agent, call tools, and stage changes for your approval before writing anything to disk.

## Features

- **37 built-in tools** — file ops, search, git, shell execution, code symbols, web fetch
- **Multi-agent system** — specialized agents for coding, architecture, review, and chat
- **Staged writes** — all file changes require human approval before hitting disk
- **Provider-agnostic** — swap LLM providers via config, not code
- **Terminal UI** — built with Ink (React for CLIs), with diffs, spinners, and markdown rendering
- **Extensible** — add tools, agents, pipeline steps, or UI adapters

## Configuration

| Env Var | Description | Default |
|---------|-------------|---------|
| `GOLEM_PROVIDER` | LLM provider (`openai`, `anthropic`, `google`, `ollama`) | `openai` |
| `GOLEM_MODEL` | Model name | Provider default |
| `GOLEM_MAX_CONTEXT_TOKENS` | Max context window size | Provider default |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI API key | — |

## Documentation

Full architecture docs, extension guide, and testing info: [GitHub](https://github.com/meirborowski/Golem)

## License

MIT
