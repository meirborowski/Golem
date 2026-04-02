# Project Golem

A modular coding agent for vibe coding, built on the **Vercel AI SDK** with **Hexagonal Architecture**.

## Tech Stack

- **Runtime:** Node.js + TypeScript (ESM)
- **LLM Layer:** Vercel AI SDK (`ai`) — provides provider-agnostic `streamText` and tool calling
- **LLM Providers:** `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `ollama-ai-provider`
- **Terminal UI:** Ink (React for CLIs) + React 19
- **Testing:** Vitest
- **Dev runner:** tsx

## Architecture

Hexagonal Architecture (Ports and Adapters) with a Middleware Pipeline.

```
src/
├── core/                  # Domain logic and ports
│   ├── entities/          # AgentContext, FileChange, TodoItem, AgentDefinition, SubAgentResult
│   ├── interfaces/        # IFileSystem, IUserInterface, IExecutionEnvironment, IPipelineStep,
│   │                      # IAgentRegistry, ISubAgentRunner, IDebugLogger
│   ├── agent.ts           # Core agent loop (streamText + stopWhen tool loop)
│   ├── AgentRouter.ts     # LLM-based agent selection / routing
│   ├── config.ts          # Runtime config resolution
│   └── createModel.ts     # Provider-agnostic model creation
│
├── adapters/              # Infrastructure — implements core interfaces
│   ├── ui/
│   │   ├── CliAdapter.ts          # Headless/CI readline adapter
│   │   └── ink/                   # Primary UI — React/Ink
│   │       ├── InkAdapter.ts      # Implements IUserInterface via UIBridge
│   │       ├── UIBridge.ts        # EventEmitter bridge (imperative <-> React)
│   │       ├── hooks/             # useUIBridge — connects React state to bridge events
│   │       └── components/        # GolemApp, MessageLog, StreamingText, DiffView,
│   │                              # ChangeConfirmation, StatusBar, TodoList, etc.
│   ├── fs/                # LocalFileSystemAdapter, MemoryFileSystemAdapter
│   ├── exec/              # LocalExecutionEnvironment
│   ├── agents/            # FileAgentRegistry (loads agent .md definitions)
│   └── debug/             # FileDebugLogger, NullDebugLogger, DebugLoggingStep
│
├── pipeline/              # Middleware that wraps the agent loop
│   ├── steps/             # ContextGatheringStep, ContextCompactionStep, HumanApprovalStep
│   └── engine.ts          # Pipeline runner with next() chaining
│
├── tools/                 # 37 tool definitions for the LLM (AI SDK tool format)
│   ├── file ops           # readFile, writeFile, editFile, deleteFile, moveFile, applyDiff, etc.
│   ├── search             # findFiles, searchFiles, searchReplace, readMultipleFiles
│   ├── symbols            # listSymbols, getSymbolDefinition
│   ├── git                # gitStatus, gitDiff, gitLog, gitCommit, gitBranch, gitStash, etc.
│   ├── execution          # executeCommand, runTests, diagnostics
│   ├── agent behavior     # think, todoWrite, askUser, askUserChoice, delegateToAgent, handOffToAgent
│   └── index.ts           # createTools() factory
│
├── agents/                # Built-in agent definitions (Markdown + YAML frontmatter)
│   ├── code.md            # Default — full tool set
│   ├── architect.md       # Read-only tools, design/planning
│   ├── review.md          # Read-only + git, code review
│   └── chat.md            # Read + web, conversational help
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
| `IPipelineStep` | Middleware interface | `ContextGatheringStep`, `ContextCompactionStep`, `HumanApprovalStep` |
| `IAgentRegistry` | Agent discovery and routing | `FileAgentRegistry` |
| `ISubAgentRunner` | Sub-agent task execution | Built into `Agent` class |
| `IDebugLogger` | Debug logging | `FileDebugLogger`, `NullDebugLogger` |

### Core Rules

1. **`/src/core` imports only from `"ai"` and our own code.** No `fs`, no `openai`, no `react`. The `"ai"` SDK is the one allowed external dependency (for `streamText`, `stepCountIs`, types).
2. **Adapters are thin translation layers.** No business logic in adapters.
3. **Pipeline steps use `execute(context, next)` middleware pattern.**
4. **Tools are defined in `/src/tools/`** using AI SDK's `tool()` helper with Zod schemas. They delegate to core interfaces (IFileSystem, IExecutionEnvironment).
5. **File writes are staged, not immediate.** The `writeFile` tool stages changes on `AgentContext.pendingChanges`. The `HumanApprovalStep` gates what gets written.

## Multi-Agent System

Golem supports multiple specialized agents with routing, delegation, and hand-off:

- **Agent definitions** are Markdown files with YAML frontmatter. Frontmatter fields: `name`, `description`, `tools` (whitelist), `model` (provider/model override), `pipeline` (pre/post step overrides), `maxSteps`. The body is the system prompt.
- **FileAgentRegistry** loads agents from `src/agents/` (built-in) and `./agents/` (project). Project agents override built-ins by name.
- **AgentRouter** uses an LLM call with structured output to pick the best agent for a user request.
- **delegateToAgent** runs a sub-agent to completion; pending changes merge back into the parent context.
- **handOffToAgent** switches the active agent; conversation history carries over.

## Agent Loop (ReAct Pattern)

```
User input
  -> Agent selection (AgentRouter picks best agent)
    -> Pre-pipeline (context gathering, context compaction)
      -> AI SDK streamText with tools + stopWhen (handles tool loop automatically)
        -> Stream tokens to UI via displayStream()
          -> Post-pipeline (human approval of staged changes)
            -> Apply approved changes to disk
              -> loop
```

The AI SDK's `stopWhen` handles the inner tool-calling loop (LLM calls tool -> execute -> return result -> LLM continues). We don't need to write that loop ourselves.

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
- `GolemApp` — root component, state machine (`idle` -> `thinking` -> `streaming` -> `confirming`)
- `MessageLog` — scrollable conversation history (user, assistant, error, system messages)
- `StreamingText` — live token accumulation during LLM streaming
- `PromptInput` — text input via `ink-text-input`
- `GolemSpinner` — animated spinner via `ink-spinner`
- `DiffView` — syntax-highlighted unified diffs for file changes
- `ChangeConfirmation` — wraps DiffView with keyboard controls (`y` approve all, `n` reject all, `s` select individually)
- `StatusBar` — model name, working directory, keyboard hints per state
- `TodoList` — task progress rendering
- `MarkdownText` — rendered markdown in terminal
- `WelcomeBanner` — startup ASCII art with version/model/directory

**Bridge pattern:** `InkAdapter.prompt()` calls `bridge.requestPrompt()` which emits an event. The React `useUIBridge` hook picks it up, shows the input, and resolves the Promise when the user submits.

## How to Add Features

### New LLM Provider
1. `npm install @ai-sdk/newprovider`
2. Update config to use the new provider model in `index.ts`
3. Done. No new adapter class needed.

### New Tool for the LLM
1. Create a new file in `/src/tools/` using AI SDK's `tool()` with a Zod schema.
2. Inject the needed core interface (e.g., `IFileSystem`).
3. Register the tool in `createTools()` in `src/tools/index.ts`.

### New Pipeline Step
1. Create a class in `/src/pipeline/steps/` implementing `IPipelineStep`.
2. Register it in the pre or post pipeline in `index.ts`.

### New Agent
1. Create a `.md` file in `src/agents/` (built-in) or `./agents/` (project-specific).
2. Add YAML frontmatter with at least `name` and `description`.
3. Optionally set `tools` (whitelist), `model`, `pipeline`, `maxSteps`.
4. Write the system prompt as the Markdown body.

### New UI (Desktop, REST API)
1. Create a new adapter in `/src/adapters/ui/` implementing `IUserInterface`.
2. Create a new entry point that injects it instead of `InkAdapter`.

## Debug Mode

Run with `GOLEM_DEBUG=1` or `--debug` to enable:
- **FileDebugLogger** writes JSONL to `.golem-debug.jsonl`
- **DebugLoggingStep** logs pipeline step entry/exit with timing
- **wrapToolsWithLogging** logs every tool call and result

## Testing

- **Core + Pipeline:** Tested with mock adapters (MockUserInterface, MockExecutionEnvironment) — no real API calls or disk writes.
- **Tools:** Tested with `MemoryFileSystemAdapter` and `MockExecutionEnvironment`.
- **Integration:** Full agent loop with a mock LLM (AI SDK `MockLanguageModelV3` with `doStream`).
- **UI Bridge:** Unit tested via EventEmitter assertions (no Ink render needed).
- **UI Components:** Tested with `ink-testing-library`.
- **Evals:** 12 mock eval cases covering code generation, codebase QA, and file editing.
- **Run:** `npx vitest run` — 65 test files, 374 tests.
