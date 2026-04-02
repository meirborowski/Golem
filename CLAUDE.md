# Project Golem

A modular coding agent for vibe coding, built on the **Vercel AI SDK** with **Hexagonal Architecture** and a middleware pipeline.

## Tech Stack

- **Runtime:** Node.js + TypeScript (ESM)
- **LLM Layer:** Vercel AI SDK (`ai`) — provides provider-agnostic `streamText`, tool calling, and `stopWhen`
- **LLM Providers:** `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, and `ollama-ai-provider` are available; swap via config, not new adapters
- **Terminal UI:** Ink (React for CLIs) + React 19
- **Testing:** Vitest
- **Dev runner:** tsx

## Architecture

Hexagonal Architecture (Ports and Adapters) with a Middleware Pipeline.

```txt
src/
├── core/                  # Domain logic and ports
│   ├── entities/          # AgentContext, FileChange, TodoItem, AgentDefinition, SubAgentResult
│   ├── interfaces/        # IFileSystem, IUserInterface, IExecutionEnvironment, IPipelineStep,
│   │                      # IAgentRegistry, ISubAgentRunner, IDebugLogger
│   ├── agent.ts           # Core agent loop (streamText + stopWhen tool loop)
│   ├── AgentRouter.ts     # LLM-based agent selection / routing
│   ├── config.ts          # Runtime config resolution (CLI args → env vars → defaults)
│   └── createModel.ts     # Provider-agnostic model creation
│
├── adapters/              # Infrastructure — implements core interfaces
│   ├── fs/                # LocalFileSystemAdapter, MemoryFileSystemAdapter
│   ├── ui/                # CliAdapter, InkAdapter + UIBridge, React/Ink UI components
│   ├── exec/              # LocalExecutionEnvironment
│   ├── agents/            # FileAgentRegistry (loads agent definitions from .md files)
│   └── debug/             # FileDebugLogger, NullDebugLogger, DebugLoggingStep, wrapToolsWithLogging
│
├── pipeline/              # Middleware that wraps the agent loop
│   ├── steps/             # ContextGatheringStep, ContextCompactionStep, HumanApprovalStep
│   └── engine.ts          # Pipeline runner with execute(context, next) chaining
│
├── tools/                 # Tool definitions for the LLM (AI SDK tool format) — 37 tools
│   ├── file ops           # readFile, writeFile, editFile, deleteFile, moveFile, applyDiff,
│   │                      # undoChange, listDirectory, directoryTree, createDirectory
│   ├── search             # findFiles, searchFiles, searchReplace, readMultipleFiles
│   ├── symbols            # listSymbols, getSymbolDefinition
│   ├── git                # gitStatus, gitDiff, gitLog, gitCommit, gitBranch, gitStash,
│   │                      # gitShow, gitBlame, fileHistory
│   ├── execution          # executeCommand, runTests, diagnostics
│   ├── web                # webFetch
│   ├── agent behavior     # think, todoWrite, askUser, askUserChoice,
│   │                      # delegateToAgent, handOffToAgent
│   ├── utilities          # gitignore (shared ignore filter), maxDepth
│   └── index.ts           # createTools() factory
│
├── agents/                # Built-in agent definitions (Markdown with YAML frontmatter)
│   ├── code.md            # Default — full tool set, general-purpose coding
│   ├── architect.md       # Read-only tools, design and planning
│   ├── review.md          # Read-only + git, code review
│   └── chat.md            # Read + web, conversational help
│
└── index.ts               # Entry point: config, DI, and startup
```

### AI SDK Handles LLM

We do **not** write our own `ILLMProvider` interface. The Vercel AI SDK already provides a provider-agnostic abstraction:

```ts
import { streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";

const result = streamText({
  model: openai("gpt-4o"),   // swap provider here
  messages,
  tools,
  stopWhen: stepCountIs(10),
});

for await (const chunk of result.textStream) {
  ui.displayStream(chunk);
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

1. **`/src/core` imports only from "ai" and our own code.** No `fs`, no `openai`, no `react`.
2. **Adapters are thin translation layers.** No business logic in adapters.
3. **Pipeline steps use `execute(context, next)` middleware pattern.**
4. **Tools are defined in `/src/tools/`** using AI SDK's `tool()` helper with Zod schemas. They delegate to core interfaces (IFileSystem, IExecutionEnvironment).
5. **File writes are staged, not immediate.** The `writeFile` tool stages changes on `AgentContext.pendingChanges`. The `HumanApprovalStep` gates what gets written.

## Multi-Agent System

Golem supports multiple specialized agents:

- **Agent definitions** are Markdown files with YAML frontmatter (name, description, tools, model override, pipeline override, maxSteps). The body is the system prompt.
- **FileAgentRegistry** loads built-in agents from `src/agents/` and project-specific agents from `./agents/`. Project agents override built-ins by name.
- **AgentRouter** uses an LLM call with structured output (`z.enum`) to pick the best agent for a user request.
- **delegateToAgent** runs a sub-agent to completion and merges its pending changes back.
- **handOffToAgent** switches the active agent for the rest of the conversation.

## Agent Loop (ReAct Pattern)

```
User input
  → Agent selection (AgentRouter picks best agent)
    → Pre-pipeline (context gathering, context compaction)
      → AI SDK streamText with tools + stopWhen (handles tool loop automatically)
        → Stream tokens to UI via displayStream()
          → Post-pipeline (human approval of staged changes)
            → Apply approved changes to disk
              → loop
```

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
- `MessageLog` — scrollable conversation history
- `StreamingText` — live token accumulation during LLM streaming
- `PromptInput` — text input via `ink-text-input`
- `GolemSpinner` — animated spinner via `ink-spinner`
- `DiffView` — syntax-highlighted unified diffs for file changes
- `ChangeConfirmation` — wraps DiffView with keyboard controls
- `StatusBar` — model name, working directory, keyboard hints
- `TodoList` — task list rendering
- `MarkdownText` — rendered markdown output
- `WelcomeBanner` — startup ASCII art and metadata

**Bridge pattern:** `InkAdapter.prompt()` calls `bridge.requestPrompt()` which emits an event. The React `useUIBridge` hook picks it up, shows the input, and resolves the Promise when the user submits.

## How to Add Features

### New LLM Provider
1. Install the provider package.
2. Update config to use the new provider model in `index.ts`.
3. Done. No new adapter class needed.

### New Tool for the LLM
1. Create a new file in `/src/tools/` using AI SDK's `tool()` with a Zod schema.
2. Inject the needed core interface.
3. Register the tool in `createTools()` in `/src/tools/index.ts`.

### New Pipeline Step
1. Create a class in `/src/pipeline/steps/` implementing `IPipelineStep`.
2. Register it in the pipeline in `src/index.ts`.

### New Agent
1. Create a `.md` file in `src/agents/` (built-in) or `./agents/` (project-specific).
2. Add YAML frontmatter: `name`, `description`, optionally `tools` (whitelist), `model`, `pipeline`, `maxSteps`.
3. Write the system prompt as the body.

### New UI
1. Create a new adapter in `/src/adapters/ui/` implementing `IUserInterface`.
2. Create a new entry point that injects it instead of `InkAdapter`.

## Testing

- **Core + Pipeline:** Tested with mock adapters — no real API calls or disk writes.
- **Tools:** Tested with `MemoryFileSystemAdapter` and `MockExecutionEnvironment`.
- **Integration:** Full agent loop with a mock LLM (`MockLanguageModelV3` with `doStream`).
- **UI Bridge:** Unit tested via EventEmitter assertions.
- **UI Components:** Tested with `ink-testing-library`.
- **Evals:** 12 mock eval cases covering code generation, codebase QA, and file editing.
- **Run:** `npx vitest run` — 65 test files, 374 tests.
