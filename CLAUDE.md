# Project Golem

A modular coding agent for vibe coding, built on the **Vercel AI SDK** with **Hexagonal Architecture**.

## Tech Stack

- **Runtime:** Node.js + TypeScript (ESM)
- **LLM Layer:** Vercel AI SDK (`ai`) — provides provider-agnostic `streamText` and tool calling
- **LLM Providers:** `@ai-sdk/openai`, `@ai-sdk/anthropic` (swap via config, no code changes)
- **Terminal UI:** Ink (React for CLIs) + React 19
- **Testing:** Vitest
- **Dev runner:** tsx

## Architecture

Hexagonal Architecture (Ports and Adapters) with a Middleware Pipeline.

```
src/
├── core/                  # Domain logic and ports
│   ├── interfaces/        # IFileSystem, IUserInterface, IExecutionEnvironment, IPipelineStep
│   ├── entities/          # AgentContext, FileChange, ToolDefinition
│   └── agent.ts           # Core agent loop (uses AI SDK's streamText + tool calling)
│
├── adapters/              # Infrastructure — implements core interfaces
│   ├── ui/
│   │   ├── CliAdapter.ts          # Legacy readline adapter (for headless/CI)
│   │   └── ink/                   # Primary UI — React/Ink
│   │       ├── InkAdapter.ts      # Implements IUserInterface via UIBridge
│   │       ├── UIBridge.ts        # EventEmitter bridge (imperative ↔ React)
│   │       ├── hooks/             # useUIBridge — connects React state to bridge events
│   │       └── components/        # GolemApp, MessageLog, StreamingText, DiffView, etc.
│   ├── fs/                # LocalFileSystemAdapter, MemoryFileSystemAdapter
│   └── exec/              # LocalExecutionEnvironment
│
├── pipeline/              # Middleware that wraps the agent loop
│   ├── steps/             # ContextGatheringStep, HumanApprovalStep, LintingStep
│   └── engine.ts          # Pipeline runner with next() chaining
│
├── tools/                 # Tool definitions for the LLM (AI SDK tool format)
│   ├── readFile.ts
│   ├── writeFile.ts
│   ├── listDirectory.ts
│   └── executeCommand.ts
│
└── index.ts               # Entry point: config, DI, and startup
```

### AI SDK Handles LLM

We do **not** write our own `ILLMProvider` interface. The Vercel AI SDK already provides a provider-agnostic abstraction:

```ts
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

const result = streamText({
  model: openai("gpt-4o"),   // swap provider here
  messages,
  tools,                      // AI SDK tool format with zod schemas
  stopWhen: stepCountIs(10),  // automatic tool-calling loop
});

for await (const chunk of result.textStream) {
  ui.displayStream(chunk);    // tokens stream to the UI in real time
}
ui.displayStreamEnd();
```

Swapping providers is a one-line config change, not a new adapter class.

### What We Still Abstract (Core Interfaces)

| Interface | Purpose | Adapters |
|-----------|---------|----------|
| `IFileSystem` | Read/write/list files | `LocalFileSystemAdapter`, `MemoryFileSystemAdapter` |
| `IUserInterface` | User I/O (prompt, display, stream, confirm) | `InkAdapter`, `CliAdapter` |
| `IExecutionEnvironment` | Run shell commands | `LocalExecutionEnvironment` |
| `IPipelineStep` | Middleware interface | `ContextGatheringStep`, `HumanApprovalStep` |

### Core Rules

1. **`/src/core` imports only from `"ai"` and our own code.** No `fs`, no `openai`, no `react`. The `"ai"` SDK is the one allowed external dependency (for `streamText`, `stepCountIs`, types).
2. **Adapters are thin translation layers.** No business logic in adapters.
3. **Pipeline steps use `execute(context, next)` middleware pattern.**
4. **Tools are defined in `/src/tools/`** using AI SDK's `tool()` helper with Zod schemas. They delegate to core interfaces (IFileSystem, IExecutionEnvironment).
5. **File writes are staged, not immediate.** The `writeFile` tool stages changes on `AgentContext.pendingChanges`. The `HumanApprovalStep` gates what gets written.

## Agent Loop (ReAct Pattern)

```
User input
  → Pre-pipeline (context gathering)
    → AI SDK streamText with tools + stopWhen (handles tool loop automatically)
      → Stream tokens to UI via displayStream()
        → Post-pipeline (human approval of staged changes)
          → Apply approved changes to disk
            → loop
```

The AI SDK's `stopWhen` handles the inner tool-calling loop (LLM calls tool → execute → return result → LLM continues). We don't need to write that loop ourselves.

## Ink UI Architecture

The agent calls `IUserInterface` methods imperatively. Ink renders declaratively via React. A `UIBridge` (EventEmitter) connects the two:

```
Agent --calls--> InkAdapter (implements IUserInterface)
                    |
                 UIBridge (EventEmitter + Promises)
                    |
               <GolemApp/> React component tree
```

**Components:**
- `GolemApp` — root component, state machine (`idle` → `thinking` → `streaming` → `confirming`)
- `MessageLog` — scrollable conversation history (user, assistant, error, system messages)
- `StreamingText` — live token accumulation during LLM streaming
- `PromptInput` — text input via `ink-text-input`
- `GolemSpinner` — animated spinner via `ink-spinner`
- `DiffView` — syntax-highlighted unified diffs for file changes
- `ChangeConfirmation` — wraps DiffView with keyboard controls (`y` approve all, `n` reject all, `s` select individually)

**Bridge pattern:** `InkAdapter.prompt()` calls `bridge.requestPrompt()` which emits an event. The React `useUIBridge` hook picks it up, shows the input, and resolves the Promise when the user submits.

## How to Add Features

### New LLM Provider
1. `npm install @ai-sdk/newprovider`
2. Update config to use the new provider model in `index.ts`
3. Done. No new adapter class needed.

### New Tool for the LLM
1. Create a new file in `/src/tools/` using AI SDK's `tool()` with a Zod schema.
2. Inject the needed core interface (e.g., `IFileSystem`).
3. Register the tool in the agent's tool map.

### New Pipeline Step
1. Create a class in `/src/pipeline/steps/` implementing `IPipelineStep`.
2. Register it in the pre or post pipeline in `index.ts`.

### New UI (Desktop, REST API)
1. Create a new adapter in `/src/adapters/ui/` implementing `IUserInterface`.
2. Create a new entry point that injects it instead of `InkAdapter`.

## Testing

- **Core + Pipeline:** Tested with mock adapters (MockFileSystem, MockUserInterface, etc.) — no real API calls or disk writes.
- **Tools:** Tested with MemoryFileSystemAdapter.
- **Integration:** Full agent loop with a mock LLM (AI SDK `MockLanguageModelV3` with `doStream`).
- **UI Bridge:** Unit tested via EventEmitter assertions (no Ink render needed).
- **Run:** `npx vitest run`
