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
│   ├── entities/          # AgentContext, FileChange, TodoItem, AgentDefinition
│   ├── interfaces/        # IFileSystem, IUserInterface, IExecutionEnvironment, IPipelineStep, etc.
│   ├── agent.ts          # Core agent loop (streamText + stopWhen tool loop)
│   ├── AgentRouter.ts    # Agent selection / routing
│   ├── config.ts         # Runtime config resolution
│   └── createModel.ts    # Provider-agnostic model creation
│
├── adapters/              # Infrastructure — implements core interfaces
│   ├── fs/               # LocalFileSystemAdapter, MemoryFileSystemAdapter
│   ├── ui/               # CliAdapter, InkAdapter + UIBridge, React/Ink UI
│   ├── exec/              # LocalExecutionEnvironment
│   ├── agents/           # FileAgentRegistry
│   └── debug/            # Debug logging helpers and tool wrappers
│
├── pipeline/              # Middleware wrapping the agent loop
│   ├── steps/            # ContextGatheringStep, ContextCompactionStep, HumanApprovalStep
│   └── engine.ts         # Pipeline runner with execute(context, next) chaining
│
├── tools/                 # AI SDK tools with Zod schemas
│   ├── file ops          # readFile, writeFile, editFile, deleteFile, moveFile, applyDiff, etc.
│   ├── repo inspection   # listDirectory, findFiles, searchFiles, git* tools, symbols, history
│   ├── execution         # executeCommand, runTests, diagnostics
│   ├── agent behavior    # askUser, askUserChoice, think, delegateToAgent, handOffToAgent
│   └── index.ts          # createTools() factory
│
└── index.ts               # Entry point: config, DI, startup
```

## How it works

1. User enters a request.
2. A **pre-pipeline** gathers and compacts context.
3. The agent calls the LLM with tools using **`streamText`**.
4. The AI SDK handles the inner tool-calling loop with **`stopWhen`**.
5. The assistant streams output to the terminal UI.
6. A **post-pipeline** asks for human approval of staged changes.
7. Approved changes are written to disk.

## Key Design Decisions

- **AI SDK handles LLM abstraction** — swapping providers is a config change, not a new adapter.
- **`src/core` is tightly isolated** — it imports only from `ai` and project-local code.
- **File writes are staged, not immediate** — `writeFile` adds to `AgentContext.pendingChanges`, and `HumanApprovalStep` decides what gets persisted.
- **Pipeline middleware uses `execute(context, next)`** — the same chaining style as Express/Koa.
- **Adapters stay thin** — business logic belongs in core and pipeline steps, not infrastructure.
- **Terminal UI uses an imperative/declarative bridge** — `InkAdapter` talks to `UIBridge`, which is rendered by React components.

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

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run Golem with tsx (no build step) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |

## Extending Golem

**New LLM provider:** install the provider package and update `index.ts` config.

**New tool:** add a file in `src/tools/` using AI SDK `tool()` + Zod, then register it in `createTools()`.

**New pipeline step:** implement `IPipelineStep` in `src/pipeline/steps/` and register it in `src/index.ts`.

**New UI:** implement `IUserInterface` in `src/adapters/ui/` and create a new entry point that injects it.

## Testing

```bash
npm test
```

Tests use mock adapters and mock models where appropriate — no real API calls or disk writes.
