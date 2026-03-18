# Golem — AI Coding Assistant

## Project Overview

Golem is a provider-agnostic CLI AI coding assistant built with TypeScript. It supports multiple LLM providers (Anthropic, OpenAI, Google, Ollama) through the Vercel AI SDK and renders a rich terminal UI using Ink (React for terminals).

**Key values**: Local-first/privacy, extensibility, simplicity.

## Architecture

Three-layer design with strict separation of concerns:

```
src/core/      — Pure logic. No React. Independently testable.
src/ui/        — Ink components + hooks. Thin rendering layer.
src/tools/     — Self-contained tool() definitions with Zod schemas.
src/utils/     — Shared helpers (file I/O, logging, project detection).
```

### Core Components

- **ConversationEngine** (`src/core/conversation.ts`): Class that manages message history and calls `streamText`. Yields `StreamEvent` objects via async generator. The `use-conversation` hook bridges it to React.
- **Provider Registry** (`src/core/provider-registry.ts`): Maps provider names to `@ai-sdk/*` factory functions. Resolves model + API key from config/env.
- **Tool Registry** (`src/core/tool-registry.ts`): Assembles all built-in tools into a ToolSet for the AI SDK.
- **Config** (`src/core/config.ts`): Layered resolution: defaults < global file < project file < env vars < CLI args.

### State Management

Single `useReducer` at the App level, distributed via React Context (`AppContextProvider`). Actions: `ADD_USER_MESSAGE`, `START_STREAMING`, `APPEND_CHUNK`, `ADD_TOOL_CALL`, `UPDATE_TOOL_CALL`, `FINISH_STREAMING`, `SET_ERROR`.

## Code Conventions

- **TypeScript strict mode**. No `any`. Use `unknown` and narrow.
- **Named exports only** — no default exports.
- **File naming**: kebab-case. React = `.tsx`, everything else = `.ts`.
- **Imports**: Use `type` keyword for type-only imports. Always use `.js` extension in import paths (ESM requirement).
- **Tools**: One file per tool in `src/tools/`. Export as named constant (factory function taking `cwd`).
- **Errors**: Tools return `{ success: false, error: string }` — never throw.
- **Logging**: Use `logger` from `src/utils/logger.ts`. Never write to stdout (Ink owns the terminal).

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
    }),
    execute: async ({ param1 }) => {
      try {
        // Implementation
        return { success: true, result: '...' };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });
```

2. Add export to `src/tools/index.ts`
3. Add to the tool map in `src/core/tool-registry.ts`

## How to Add a New Provider

1. Install `@ai-sdk/{provider}` or community provider package
2. Add entry in `src/core/provider-registry.ts`:

```typescript
providers.set('myProvider', {
  name: 'myProvider',
  defaultModel: 'model-name',
  envKeyName: 'MY_PROVIDER_API_KEY',
  createModel: (modelId, options) => {
    const provider = createMyProvider({ apiKey: options?.apiKey });
    return provider(modelId);
  },
});
```

## Build & Run

```bash
npm install          # Install dependencies
npm run dev          # Run in dev mode (tsx)
npm run build        # Compile TypeScript → dist/
npm run start        # Run compiled version
npm test             # Run vitest
npm run typecheck    # Type-check without emitting
npm run format       # Format with Prettier
```

## CLI Usage

```bash
golem                              # Default (Anthropic Claude)
golem --provider openai -m gpt-4o  # Use OpenAI
golem --provider ollama -m llama3.1 # Use local Ollama
golem --debug                      # Enable debug logging
```

## Config Files

- Global: `~/.config/golem/config.json`
- Project: `.golem/config.json` (walks up from cwd)
- Env vars: `GOLEM_PROVIDER`, `GOLEM_MODEL`, `ANTHROPIC_API_KEY`, etc.

## Testing

- **Framework**: Vitest
- **Tools**: Test by calling `execute()` directly — they're pure functions
- **ConversationEngine**: Mock `streamText` from the AI SDK
- **UI**: Use `ink-testing-library` for component render tests

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
| `ink-text-input` | Text input component |
| `ink-spinner` | Loading spinner |
| `meow` | CLI argument parsing |
| `fast-glob` | Glob pattern matching |
| `ignore` | .gitignore parsing |
| `cli-highlight` | Syntax highlighting |
| `chalk` | Terminal colors |
