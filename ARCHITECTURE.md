# Golem Architecture

## Overview

Golem uses a typed event bus architecture. Components communicate through events, never calling each other directly. This eliminates tight coupling, race conditions (e.g., MCP tools arriving late), and Promise callbacks leaking into React.

## Directory Structure

```text
src/
  bus/              Event bus: GolemEvent union, EventBus, helpers
  subscribers/      10 bus subscribers that drive the runtime
  agents/           Agent loader, runner, types, markdown configs
  core/             Config, types, session, extension registry, command handler
  extensions/       Built-in extensions: tools, providers, commands, prompt sections
  tools/            19 built-in tool definitions (one file per tool)
  ui/               Ink components, bus-driven hooks, context
  utils/            File I/O, logging, project detection, stream utils
  bootstrap.ts      Creates EventBus + all subscribers, registers tools/providers
  app.tsx            React root: BusProvider + AppContextProvider + ChatView
  index.tsx          CLI entrypoint: config, logging, process handlers
```

## Event Bus

All events form a single discriminated union (`GolemEvent`) keyed on `type`, grouped by domain prefix:

| Domain | Events | Purpose |
|--------|--------|---------|
| `stream:*` | requested, started, text-delta, finished, error | LLM streaming lifecycle |
| `tool:*` | registered, unregistered, call-requested, call-started, call-completed | Tool registration and execution |
| `approval:*` | requested, resolved | Non-blocking approval flow |
| `agent:*` | started, turn-completed, finished, chain-push, chain-pop, todos-updated | Multi-turn agent orchestration |
| `mcp:*` | connecting, connected, error, disconnected | MCP server lifecycle |
| `history:*` | message-added, truncated, cleared | Message history |
| `session:*` | saved, loaded | Session persistence |
| `config:*` | changed, provider-switched, provider-registered | Configuration changes |
| `command:*` | registered, executed, result | Slash commands |
| `ui:*` | input-submitted, ready | UI events |

**EventBus API:**
- `on(type, handler)` → unsubscribe function
- `emit(event)` → async, dispatches in registration order
- `once(type)` → resolves on next event
- `waitFor(type, predicate, timeout?)` → resolves on matching event
- `use(interceptor)` → for debug tracing

**Files:** `src/bus/event-bus.ts`, `src/bus/events.ts`, `src/bus/helpers.ts`

## Subscribers

Each subscriber is a plain class (no React) that receives the bus in its constructor, subscribes to events, and emits events. Private state, public `dispose()`.

### StreamCoordinator
Manages `streamText` calls from the Vercel AI SDK. Wraps each tool's `execute` function to emit `tool:call-requested` and wait for `tool:call-completed`, bridging the synchronous AI SDK model with the async bus. Resolves the model lazily on first `stream:requested` (providers may not be registered at construction time).

- **Listens:** `stream:requested`, `config:provider-switched`
- **Emits:** `stream:started`, `stream:text-delta`, `tool:call-requested`, `stream:finished`, `stream:error`, `history:message-added`

### ToolExecutor
Executes tools with inline approval checking. Maintains the live tool set (dynamically updated as MCP tools are discovered). Replaces the old middleware pipeline.

- **Listens:** `tool:call-requested`, `approval:resolved`, `tool:registered`, `tool:unregistered`
- **Emits:** `tool:call-started`, `tool:call-completed`, `approval:requested`

### ApprovalGate
Non-blocking approval state machine. The UI reads pending state via a hook and emits `approval:resolved` directly — no Promise callbacks leak into React.

- **Listens:** `approval:requested`, `approval:resolved`

### AgentLoop
Multi-turn agent state machine. Evaluates stop conditions (`default`, `agent-done-only`, `single-turn`) after each stream finish to decide whether to continue.

- **Listens:** `agent:started`, `stream:finished`
- **Emits:** `stream:requested`, `agent:turn-completed`, `agent:finished`

### McpBridge
Connects MCP servers on `ui:ready`, discovers tools, registers them on ToolExecutor dynamically. Eliminates the race condition where MCP tools could miss the first message.

- **Listens:** `ui:ready`
- **Emits:** `mcp:connecting`, `mcp:connected`, `mcp:error`, `tool:registered`

### HistoryManager
Owns the canonical message history and context window truncation. StreamCoordinator reads history via synchronous getter before each `streamText` call.

- **Listens:** `history:cleared`, `session:loaded`

### PromptBuilder
Assembles the system prompt from agent config, extension sections, tool metadata, MCP descriptions, and memory. Caches until invalidated by `tool:registered` or `config:changed`.

- **Listens:** `tool:registered`, `tool:unregistered`, `config:changed`

### ConfigManager
Holds resolved config and provider entries. Replaces the old global mutable provider registry.

- **Listens:** `config:provider-registered`
- **Emits:** `config:changed`, `config:provider-switched`

### SessionManager
Save/load conversation sessions. Thin wrapper over `src/core/session.ts`.

- **Emits:** `session:saved`, `session:loaded`

### CommandHandler
Routes user input: slash commands go to `handleCommand()`, regular messages emit `stream:requested`.

- **Listens:** `ui:input-submitted`
- **Emits:** `command:executed`, `stream:requested`

## Message Flow

```
User types → InputBar → ChatView emits ui:input-submitted
  → CommandHandler receives it
    → If slash command: processes inline, emits command:result
    → If regular message: emits stream:requested

stream:requested
  → StreamCoordinator adds user message to history, truncates, calls streamText()
    → For each text chunk: emits stream:text-delta
    → For each tool call: the wrapped execute() emits tool:call-requested
      → ToolExecutor checks approval
        → If needed: emits approval:requested, waits for approval:resolved
        → Executes tool, emits tool:call-completed
      → StreamCoordinator's wrapped execute() resolves with the result
    → After stream ends: emits stream:finished

stream:finished (during agent mode)
  → AgentLoop evaluates shouldContinue()
    → If yes: emits stream:requested with continuation prompt
    → If no: emits agent:finished

UI hooks subscribe to events and update React state:
  useBusMessages ← history:message-added, history:cleared
  useBusStreaming ← stream:started, stream:text-delta, stream:finished (30fps batching)
  useBusApproval ← approval:requested, approval:resolved
  useBusAgent ← agent:started, agent:turn-completed, agent:finished, tool:call-*
  useBusTokenUsage ← stream:finished
```

## Bootstrap Sequence

1. `index.tsx`: Parse CLI args, resolve config, init logger, start SearXNG
2. `app.tsx`: Create ExtensionRegistry, register builtins, load agent config
3. `bootstrap.ts`: `createGolemBus()` →
   - Create EventBus, wire `onError` to logger
   - Create all 10 subscribers
   - Register providers from extensions onto ConfigManager
   - Register tools from extensions onto ToolExecutor (with `tool:registered` events)
4. `app.tsx`: Wrap ChatView in `BusProvider` + `AppContextProvider`
5. ChatView mounts → emits `ui:ready` → McpBridge connects MCP servers

## Extension System

Extensions implement the `GolemExtension` interface and contribute tools, providers, commands, and system prompt sections:

```typescript
interface GolemExtension {
  name: string;
  tools?: (cwd: string, config: ResolvedConfig) => ToolSet;
  commands?: Record<string, CommandDefinition>;
  systemPromptSections?: (config: ResolvedConfig) => SystemPromptSection[];
  providers?: () => Record<string, ProviderEntry>;
}
```

Built-in extensions: `builtin-tools`, `builtin-providers`, `builtin-commands`, `builtin-prompt-sections`.

## UI Layer

The UI is a thin rendering layer using Ink (React for terminals). It reads all dynamic state from bus events via focused hooks:

| Hook | Events | Returns |
|------|--------|---------|
| `useBusMessages` | `history:*`, `session:loaded`, `command:result` | `ChatMessage[]` |
| `useBusStreaming` | `stream:*` | `{ isStreaming, streamingText, error }` |
| `useBusApproval` | `approval:*` | `{ pendingApproval, approve(), deny() }` |
| `useBusAgent` | `agent:*`, `tool:call-*` | `AgentModeState \| null` |
| `useBusTokenUsage` | `stream:finished` | `TokenUsage` |
| `useBusSendMessage` | — | `{ sendMessage(), sendAgentMessage(), cancelAgent() }` |

`AppContextProvider` passes display-only values: config, registry, model/provider names, switchModel, switchAgent.

### Rendering Performance

- Completed messages use Ink's `<Static>` — rendered once, never redrawn
- Active streaming message constructed from `streamingText`, not the message array
- Text deltas batched at 32ms (~30fps)
- Message component wrapped in `React.memo`
