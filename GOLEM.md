# Golem — AI Coding Assistant

## Project Overview

Golem is a provider-agnostic CLI AI coding assistant built with TypeScript. It supports multiple LLM providers through the Vercel AI SDK and renders a rich terminal UI using Ink.

**Key values**: local-first privacy, extensibility, simplicity, and explicit behavior.

## Current Architecture

Golem uses an event bus architecture where decoupled subscribers communicate through typed events.

```text
src/index.tsx           CLI entrypoint, config resolution, process setup
src/app.tsx             React root — creates bus via bootstrap, wraps with BusProvider
src/bootstrap.ts        Creates EventBus, all subscribers, registers tools/providers
src/bus/                Typed event bus: GolemEvent union, EventBus, helpers
src/subscribers/        Bus subscribers that drive the runtime
src/agents/             Agent loading and multi-turn execution
src/core/               Config, types, session, extension registry, command handler
src/ui/                 Ink components and bus-driven hooks
src/tools/              Built-in tool() implementations
src/extensions/         Extension packages that add tools, commands, providers, prompts
src/utils/              Shared helpers for files, logging, and project detection
```

### Core Runtime Flow

1. `src/index.tsx` resolves config, initializes logging, starts SearXNG.
2. `src/app.tsx` creates the extension registry, loads agent config, then calls `createGolemBus()` which builds the event bus and all subscribers.
3. Bootstrap registers providers and tools from extensions onto ConfigManager and ToolExecutor.
4. ChatView mounts and emits `ui:ready`, triggering McpBridge to connect MCP servers.
5. User input emits `ui:input-submitted` → CommandHandler routes to `stream:requested` or slash commands.
6. StreamCoordinator calls `streamText`, emitting `stream:text-delta` / `tool:call-requested` / `stream:finished` events.
7. ToolExecutor handles tool execution with inline approval checks (emits `approval:requested` for gated tools).
8. AgentLoop coordinates multi-turn execution by listening to `stream:finished` and deciding whether to continue.
9. Bus-driven UI hooks (`useBusMessages`, `useBusStreaming`, `useBusApproval`, etc.) subscribe to events and update React state.

### Bus Subscribers

- **StreamCoordinator** (`src/subscribers/stream-coordinator.ts`): Manages `streamText` calls from the Vercel AI SDK. Wraps tools to route execution through the bus.
- **ToolExecutor** (`src/subscribers/tool-executor.ts`): Executes tools, checks approval config, manages the live tool set.
- **ApprovalGate** (`src/subscribers/approval-gate.ts`): Non-blocking approval state. UI reads pending state and emits `approval:resolved` directly.
- **AgentLoop** (`src/subscribers/agent-loop.ts`): Multi-turn agent state machine with stop conditions.
- **McpBridge** (`src/subscribers/mcp-bridge.ts`): Connects MCP servers, discovers tools, registers them dynamically.
- **HistoryManager** (`src/subscribers/history-manager.ts`): Message history and context window truncation.
- **PromptBuilder** (`src/subscribers/prompt-builder.ts`): System prompt assembly with caching.
- **ConfigManager** (`src/subscribers/config-manager.ts`): Config resolution, provider registry, model switching.
- **SessionManager** (`src/subscribers/session-manager.ts`): Save/load conversation sessions.
- **CommandHandler** (`src/subscribers/command-handler.ts`): Slash command routing.

### Other Core Components

- **Extension Registry** (`src/core/extension-registry.ts`): Collects tools, providers, commands, and system prompt sections from extensions.
- **Config** (`src/core/config.ts`): Resolves settings from defaults, global config, project config, env vars, and CLI args.
- **Session** (`src/core/session.ts`): Saves, loads, lists, and exports sessions.
- **Agent Runner** (`src/agents/agent-runner.ts`): Framework-agnostic multi-turn loop (used by AgentLoop subscriber and delegate-agent tool).

## Working Style and Conventions

- Prefer small, focused changes that preserve the existing architecture.
- Keep pure logic in `src/core/` and `src/agents/`; keep React/Ink concerns in `src/ui/`.
- Use named exports only. Do not add default exports.
- Keep imports ESM-compatible with `.js` suffixes in TypeScript source.
- Follow strict TypeScript patterns; prefer `unknown` over `any` unless a test needs a narrow cast.
- Avoid stdout logging. Use the shared logger and let Ink own terminal output.
- Tools should return `{ success: false, error: string }` instead of throwing for expected failures.
- When changing behavior, update or add focused tests alongside the code.
- Read relevant files before editing, and verify edits before finishing.

## State Management

The app uses an event bus (`src/bus/`) with typed events. UI state is derived from bus events via focused hooks:

- `useBusMessages` — message list from `history:*` events
- `useBusStreaming` — streaming state + 30fps text batching from `stream:*` events
- `useBusApproval` — approval state from `approval:*` events (no Promise callbacks)
- `useBusAgent` — agent mode state from `agent:*` and `tool:*` events
- `useBusTokenUsage` — token usage from `stream:finished`
- `useBusSendMessage` — emits `ui:input-submitted` or calls `AgentLoop.run()`

`AppContextProvider` remains as a thin pass-through for display-only values (config, model name, provider name, registry).

## Rendering Performance

- Completed messages use Ink's `<Static>` so they do not rerender.
- Only the active streaming message and input area redraw while streaming.
- Text deltas are batched to reduce re-renders.
- Markdown rendering is deferred until streaming finishes.

## Code Conventions

- **TypeScript strict mode**. Avoid `any`; prefer `unknown` and narrow deliberately. A few test-only casts are acceptable when mocking external SDK types.
- **Named exports only** — no default exports.
- **File naming**: kebab-case. React = `.tsx`, everything else = `.ts`.
- **Imports**: Use `type` keyword for type-only imports. Always use `.js` extension in import paths.
- **Tools**: One file per tool in `src/tools/`. Export as named constant or factory taking `cwd`.
- **Tool schemas**: Use `z.union([z.type(), z.null()])` for optional parameters. Handle defaults in `execute()`.
- **Errors**: Tools return `{ success: false, error: string }` — never throw.
- **Logging**: Use `logger` from `src/utils/logger.ts`. Never write to stdout.
- **Testing**: Prefer focused unit tests for core logic, agents, tools, and session/config behavior.

## Built-in Tools

| Tool | File | Description |
|------|------|-------------|
| `readFile` | `src/tools/read-file.ts` | Read file contents with optional line range |
| `writeFile` | `src/tools/write-file.ts` | Create or overwrite files |
| `editFile` | `src/tools/edit-file.ts` | Find-and-replace text in files |
| `listFiles` | `src/tools/list-files.ts` | Glob-based file discovery |
| `searchFiles` | `src/tools/search-files.ts` | Regex search across files |
| `bash` | `src/tools/bash.ts` | Shell command execution (requires approval) |
| `git` | `src/tools/git.ts` | Git operations with read-only/approval-aware gating |
| `memory` | `src/tools/memory.ts` | Persist key/value context across sessions |
| `todoManager` | `src/tools/todo-manager.ts` | Track multi-step work items |
| `multiEdit` | `src/tools/multi-edit.ts` | Apply multiple replacements in one pass |
| `patch` | `src/tools/patch.ts` | Apply unified diffs |
| `directoryTree` | `src/tools/directory-tree.ts` | Show directory structure |
| `codeOutline` | `src/tools/code-outline.ts` | Extract symbols from source files |
| `diffFiles` | `src/tools/diff-files.ts` | Compare files or raw content |
| `rename` | `src/tools/rename.ts` | Rename or move files and directories |
| `webSearch` | `src/tools/web-search.ts` | Search the web via SearXNG |
| `fetchUrl` | `src/tools/fetch.ts` | Make HTTP requests to URLs |
| `think` | `src/tools/think.ts` | Private scratchpad for planning |
| `agentDone` | `src/tools/agent-done.ts` | Mark a task as completed |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear conversation history |
| `/model` | Show current model |
| `/provider` | Show current provider |
| `/save` | Save current session |
| `/load [id]` | Load a saved session (latest if no id) |
| `/history` | List saved sessions |
| `/export` | Export the current session to Markdown |
| `/exit`, `/quit` | Exit Golem |

## Agent Rules

When acting as Golem in this repository:

1. Use `think` before making changes that touch multiple files or require tradeoffs.
2. Read the relevant files before editing them.
3. Keep changes minimal and focused on the requested task.
4. Verify edits by re-reading files and running tests when appropriate.
5. Prefer test-first or test-aligned changes for core behavior.
6. Do not guess about code you have not inspected.
7. Use existing project conventions: strict TypeScript, named exports, `.js` import suffixes, and no stdout logging.
8. For tools, return `{ success: false, error: string }` instead of throwing from tool logic.
9. For tasks that modify files or create artifacts, finish by confirming what changed.
10. Do not ask for clarification unless the task is genuinely ambiguous and blocking.

## Build & Run

```bash
npm install        # Install dependencies
npm run dev         # Run in dev mode (tsx)
npm run build      # Compile TypeScript -> dist/
npm start          # Run compiled version
npm test            # Run Vitest tests
npm run test:watch  # Run Vitest in watch mode
npm run typecheck   # Type-check without emitting
npm run lint        # Check formatting with Prettier
npm run format      # Format with Prettier
```

## CLI Usage

```bash
golem                               # Default provider/model from config
golem --provider openai -m gpt-4o   # Use OpenAI
golem --provider ollama -m llama3.1  # Use local Ollama
golem --debug                       # Enable debug logging
```

## Config Files

- Global: `~/.config/golem/config.json` (or `%APPDATA%\\golem\\config.json` on Windows)
- Project: `.golem/config.json` (walks up from cwd)
- Env vars: `GOLEM_PROVIDER`, `GOLEM_MODEL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.

### Config Options

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "maxTokens": 4096,
  "contextWindow": 128000,
  "temperature": 0.7,
  "providers": {
    "ollama": { "baseUrl": "http://localhost:11434/api" }
  }
}
```

## Testing

- **Framework**: Vitest
- **Tools**: Test by calling `execute()` directly
- **ConversationEngine**: Test truncation, history, stream events, and system prompt building
- **Agent runner**: Test multi-turn continuation, cancellation, and `agentDone` behavior
- **Session**: Test save/load/list/export with temp directories
- **Run**: `npm test`

## Dependencies

| Package | Purpose |
|---------|---------|
| `ai` | Vercel AI SDK — `streamText`, `tool`, message types |
| `@ai-sdk/anthropic` | Anthropic provider |
| `@ai-sdk/openai` | OpenAI provider |
| `@ai-sdk/google` | Google Gemini provider |
| `@ai-sdk/mcp` | MCP integration |
| `@modelcontextprotocol/sdk` | MCP protocol SDK |
| `ollama-ai-provider` | Ollama local model provider |
| `zod` | Schema validation for tool inputs |
| `ink` | React-based terminal UI |
| `ink-spinner` | Loading spinner |
| `ink-text-input` | Text input component |
| `cli-highlight` | Syntax highlighting in code blocks |
| `chalk` | Terminal colors |
| `meow` | CLI argument parsing |
| `fast-glob` | Glob pattern matching |
