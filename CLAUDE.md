# Golem — AI Coding Assistant

## Project Overview

Golem is a provider-agnostic CLI AI coding assistant built with TypeScript. It supports multiple LLM providers (Anthropic, OpenAI, Google, Ollama) through the Vercel AI SDK and renders a rich terminal UI using Ink (React for terminals).

**Key values**: Local-first/privacy, extensibility, simplicity.

## Architecture

Event bus architecture with typed pub/sub and decoupled subscribers:

```text
src/bus/           Typed event bus: GolemEvent union (~30 events), EventBus, helpers.
src/subscribers/   Bus subscribers: StreamCoordinator, ToolExecutor, AgentLoop, McpBridge,
                   HistoryManager, PromptBuilder, ConfigManager, ApprovalGate, SessionManager,
                   CommandHandler.
src/agents/        Agent loader/runner/types. Orchestrates multi-turn task execution.
src/core/          Config, types, session, extension registry, command handler.
src/ui/            Ink components + bus-driven hooks. Thin rendering layer.
src/tools/         Self-contained tool() definitions with Zod schemas.
src/utils/         Shared helpers (file I/O, logging, project detection).
```

### Core Components

- **EventBus** (`src/bus/event-bus.ts`): Typed pub/sub with `on/emit/once/waitFor/use`. Events are a discriminated union (`GolemEvent`) grouped by domain: `stream:*`, `tool:*`, `approval:*`, `agent:*`, `mcp:*`, `history:*`, `session:*`, `config:*`, `command:*`, `ui:*`.
- **Bootstrap** (`src/bootstrap.ts`): `createGolemBus()` creates the bus, all subscribers, registers providers and tools from extensions.
- **StreamCoordinator** (`src/subscribers/stream-coordinator.ts`): Calls `streamText` from the AI SDK, wraps tool execute functions to route through the bus.
- **ToolExecutor** (`src/subscribers/tool-executor.ts`): Executes tools with inline approval checking. Replaces the old middleware pipeline.
- **ConfigManager** (`src/subscribers/config-manager.ts`): Holds resolved config and provider entries. Replaces the old global provider registry.
- **AgentLoop** (`src/subscribers/agent-loop.ts`): Multi-turn agent state machine driven by `stream:finished` events.
- **McpBridge** (`src/subscribers/mcp-bridge.ts`): MCP server connections with dynamic tool discovery (eliminates race conditions).
- **Agent Runner** (`src/agents/agent-runner.ts`): Framework-agnostic multi-turn loop with stop conditions.
- **Config** (`src/core/config.ts`): Layered resolution: defaults < global file < project file < env vars < CLI args.
- **Session** (`src/core/session.ts`): Saves/loads/lists conversation sessions as JSON files in `~/.config/golem/sessions/`.

## State Management

Event bus with typed events replaces the old `useReducer`. UI state is derived from bus events via focused hooks (`useBusMessages`, `useBusStreaming`, `useBusApproval`, `useBusAgent`, `useBusTokenUsage`, `useBusSendMessage`). `AppContextProvider` remains as a thin pass-through for display-only values (config, model name, provider name, registry).

## Rendering Performance

- Completed messages use Ink's `<Static>` — rendered once, never redrawn.
- Only the active streaming message + input bar redraws during streaming.
- Text deltas are batched at ~30fps to reduce re-renders.
- `Message` component is wrapped in `React.memo`.
- Markdown rendering is deferred until streaming completes (plain text during streaming).

## Code Conventions

- **TypeScript strict mode**. Avoid `any`; prefer `unknown` and narrow deliberately. A few test-only casts are acceptable when mocking external SDK types.
- **Named exports only** — no default exports.
- **File naming**: kebab-case. React = `.tsx`, everything else = `.ts`.
- **Imports**: Use `type` keyword for type-only imports. Always use `.js` extension in import paths (ESM requirement).
- **Tools**: One file per tool in `src/tools/`. Export as named constant (factory function taking `cwd`).
- **Tool schemas**: Use `z.union([z.type(), z.null()])` for optional parameters (Anthropic API requires all properties in `required`). Handle defaults in `execute()`.
- **Errors**: Tools return `{ success: false, error: string }` — never throw.
- **Logging**: Use `logger` from `src/utils/logger.ts`. Never write to stdout (Ink owns the terminal).
- **Testing**: Prefer focused unit tests for core logic, agents, and tools. Mock external SDK boundaries instead of calling live providers.

## How to Add a New Tool

1. Create `src/tools/my-tool.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export const myTool = (cwd: string) =>
  tool({
    description: 'What this tool does',
    parameters: z.object({
      param1: z.string().describe('Description'),
      optionalParam: z.union([z.number(), z.null()]).describe('Optional. Null defaults to 10.'),
    }),
    execute: async ({ param1, optionalParam: rawOpt }) => {
      const optionalParam = rawOpt ?? 10;
      try {
        return { success: true, result: '...' };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });
```

2. Add export to `src/tools/index.ts`
3. Add to the tool map in `src/extensions/builtin-tools.ts`
4. Add tests in `src/tools/tools.test.ts`

## How to Add a New Provider

1. Install `@ai-sdk/{provider}` or community provider package
2. Add entry in `src/extensions/builtin-providers.ts`:

```typescript
myProvider: {
  name: 'myProvider',
  defaultModel: 'model-name',
  envKeyName: 'MY_PROVIDER_API_KEY',
  createModel: (modelId: string, options?: ProviderConfig): LanguageModel => {
    const key = options?.apiKey || process.env['MY_PROVIDER_API_KEY'];
    if (!key) throw new Error('API key not found.');
    const provider = createMyProvider({ apiKey: key });
    return provider(modelId);
  },
},
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
npm install          # Install dependencies
npm run dev          # Run in dev mode (tsx)
npm run build        # Compile TypeScript -> dist/
npm run start        # Run compiled version
npm test             # Run vitest
npm run typecheck    # Type-check without emitting
npm run format       # Format with Prettier
```

## CLI Usage

```bash
golem                               # Default (Anthropic Claude)
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
- **Tools**: Test by calling `execute()` directly — they're pure functions
- **ConversationEngine**: Test truncation, history, stream events, and system prompt building
- **Agent runner**: Test multi-turn continuation, cancellation, and `agentDone` behavior
- **Session**: Test save/load/list with temp directories
- **Run**: `npm test`

## Dependencies

| Package | Purpose |
|---------|---------|
| `ai` | Vercel AI SDK — `streamText`, `tool`, message types |
| `@ai-sdk/anthropic` | Anthropic provider |
| `@ai-sdk/openai` | OpenAI provider |
| `@ai-sdk/google` | Google Gemini provider |
| `ollama-ai-provider` | Ollama local model provider |
| `zod` | Schema validation for tool inputs |
| `ink` | React-based terminal UI |
| `ink-spinner` | Loading spinner |
| `cli-highlight` | Syntax highlighting in code blocks |
| `chalk` | Terminal colors |
| `meow` | CLI argument parsing |
| `fast-glob` | Glob pattern matching |
