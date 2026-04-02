# Golem

A modular, provider-agnostic coding agent for vibe coding, built on the [Vercel AI SDK](https://sdk.vercel.ai/) with Hexagonal Architecture and a middleware pipeline.

Golem reads your intent, gathers context from your codebase, calls an LLM with tools, and applies changes with human approval before any writes hit disk.

## Quick Start

```bash
npm install
export OPENAI_API_KEY=your-key-here
npm run dev
```

## Architecture

```txt
src/
├── core/                  # Domain logic and ports — no external imports except AI SDK
│   ├── entities/          # AgentContext, FileChange, TodoItem, AgentDefinition, SubAgentResult
│   ├── interfaces/        # IFileSystem, IUserInterface, IExecutionEnvironment, IPipelineStep,
│   │                      # IAgentRegistry, ISubAgentRunner, IDebugLogger
│   ├── agent.ts           # Core agent loop (streamText + stopWhen tool loop)
│   ├── AgentRouter.ts     # LLM-based agent selection / routing
│   ├── config.ts          # Runtime config resolution
│   └── createModel.ts     # Provider-agnostic model creation
│
├── adapters/              # Infrastructure — implements core interfaces
│   ├── fs/                # LocalFileSystemAdapter, MemoryFileSystemAdapter
│   ├── ui/                # CliAdapter, InkAdapter + UIBridge, React/Ink UI
│   ├── exec/              # LocalExecutionEnvironment
│   ├── agents/            # FileAgentRegistry
│   └── debug/             # Debug logging helpers and tool wrappers
│
├── pipeline/              # Middleware wrapping the agent loop
│   ├── steps/             # ContextGatheringStep, ContextCompactionStep, HumanApprovalStep
│   └── engine.ts          # Pipeline runner with execute(context, next) chaining
│
├── tools/                 # 37 AI SDK tools with Zod schemas
│   ├── file ops           # readFile, writeFile, editFile, deleteFile, moveFile, applyDiff, etc.
│   ├── search             # findFiles, searchFiles, searchReplace, readMultipleFiles
│   ├── symbols            # listSymbols, getSymbolDefinition
│   ├── git                # gitStatus, gitDiff, gitLog, gitCommit, gitBranch, gitStash, etc.
│   ├── execution          # executeCommand, runTests, diagnostics
│   ├── agent behavior     # think, todoWrite, askUser, askUserChoice, delegateToAgent, handOffToAgent
│   └── index.ts           # createTools() factory
│
├── agents/                # Built-in agent definitions (Markdown + YAML frontmatter)
│   ├── code.md            # Default — full tool set, general-purpose coding
│   ├── architect.md       # Read-only tools, design and planning
│   ├── review.md          # Read-only + git, code review
│   └── chat.md            # Read + web, conversational help
│
└── index.ts               # Entry point: config, DI, startup
```

## How it works

1. User enters a request.
2. **AgentRouter** selects the best agent for the task.
3. A **pre-pipeline** gathers context and compacts conversation history when needed.
4. The agent calls the LLM with tools using **`streamText`**.
5. The AI SDK handles the inner tool-calling loop with **`stopWhen`**.
6. The assistant streams output to the terminal UI.
7. A **post-pipeline** asks for human approval of staged changes.
8. Approved changes are written to disk.

## Key Design Decisions

- **AI SDK handles LLM abstraction** — swapping providers is a config change, not a new adapter.
- **`src/core` is tightly isolated** — it imports only from `ai` and project-local code.
- **File writes are staged, not immediate** — `writeFile` adds to `AgentContext.pendingChanges`, and `HumanApprovalStep` decides what gets persisted.
- **Pipeline middleware uses `execute(context, next)`** — the same chaining style as Express/Koa.
- **Adapters stay thin** — business logic belongs in core and pipeline steps, not infrastructure.
- **Terminal UI uses an imperative/declarative bridge** — `InkAdapter` talks to `UIBridge`, which is rendered by React components.
- **Multi-agent support** — agents are Markdown files with YAML frontmatter; they can delegate to or hand off to each other.

## Terminal UI

The terminal UI is built with Ink and React.

Main pieces:
- `GolemApp` — root state machine
- `MessageLog` — conversation history
- `StreamingText` — live assistant token stream
- `PromptInput` — user input
- `GolemSpinner` — loading indicator
- `DiffView` — staged file diffs
- `ChangeConfirmation` — approve/reject staged changes
- `StatusBar` — model name, directory, keyboard hints
- `TodoList` — task progress display

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run Golem with tsx (no build step) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm test` | Run all tests (65 files, 374 tests) |
| `npm run test:watch` | Run tests in watch mode |

## Extending Golem

**New LLM provider:** install the provider package and update `index.ts` config.

**New tool:** add a file in `src/tools/` using AI SDK `tool()` + Zod, then register it in `createTools()`.

**New pipeline step:** implement `IPipelineStep` in `src/pipeline/steps/` and register it in `src/index.ts`.

**New agent:** create a `.md` file in `src/agents/` or `./agents/` with YAML frontmatter (`name`, `description`, optional `tools`/`model`/`pipeline`/`maxSteps`) and a system prompt body.

**New UI:** implement `IUserInterface` in `src/adapters/ui/` and create a new entry point that injects it.

## Testing

```bash
npm test
```

Tests use mock adapters and mock models where appropriate — no real API calls or disk writes.
