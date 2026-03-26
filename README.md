# Golem

A modular, provider-agnostic coding agent built on the [Vercel AI SDK](https://sdk.vercel.ai/) with Hexagonal Architecture.

Golem reads your intent, gathers context from your codebase, calls an LLM with tools (read/write files, run commands), and applies changes — with human approval before any writes hit disk.

## Quick Start

```bash
npm install
export OPENAI_API_KEY=your-key-here
npm run dev
```

## Architecture

```
src/
├── core/           # Domain logic and ports — no external imports (except AI SDK)
│   ├── entities/   # AgentContext, FileChange
│   ├── interfaces/ # IFileSystem, IUserInterface, IExecutionEnvironment, IPipelineStep
│   └── agent.ts    # Core agent loop (generateText + tool calling)
│
├── adapters/       # Infrastructure — implements core interfaces
│   ├── fs/         # LocalFileSystemAdapter, MemoryFileSystemAdapter
│   ├── ui/         # CliAdapter (readline)
│   └── exec/       # LocalExecutionEnvironment (child_process)
│
├── pipeline/       # Middleware wrapping the agent loop
│   ├── steps/      # ContextGatheringStep, HumanApprovalStep
│   └── engine.ts   # Pipeline runner with next() chaining
│
├── tools/          # LLM tool definitions (AI SDK format with Zod schemas)
│   ├── readFile, writeFile, listDirectory, executeCommand
│   └── index.ts    # createTools() factory
│
└── index.ts        # Entry point: config, DI, startup
```

### Key Design Decisions

- **AI SDK handles LLM abstraction** — swapping providers (OpenAI, Anthropic, Ollama) is a one-line config change, not a new adapter class.
- **File writes are staged, not immediate** — the `writeFile` tool pushes to `AgentContext.pendingChanges`. The `HumanApprovalStep` gates what gets written.
- **Two pipelines (pre and post)** — pre-pipeline runs before the LLM call (context gathering), post-pipeline runs after (human approval).
- **Middleware pattern** — pipeline steps use `execute(context, next)` chaining, just like Express/Koa middleware.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run Golem with tsx (no build step) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |

## Extending Golem

**New LLM provider:** `npm install @ai-sdk/anthropic`, change the model in `index.ts`.

**New tool:** Create a file in `src/tools/` using AI SDK's `tool()` with a Zod schema, register it in `createTools()`.

**New pipeline step:** Implement `IPipelineStep` in `src/pipeline/steps/`, register in `index.ts`.

**New UI:** Implement `IUserInterface` in `src/adapters/ui/`, create a new entry point that injects it.

## Testing

```bash
npm test
```

Core logic is tested with mock adapters (`MemoryFileSystemAdapter`, `MockUserInterface`, `MockLanguageModelV3`) — no real API calls or disk writes.
