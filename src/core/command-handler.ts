import type { AgentConfig } from '../agents/agent-types.js';
import type { ChatMessage, TokenUsage, ResolvedConfig } from './types.js';
import type { CommandDefinition } from './extension.js';
import type { ExtensionRegistry } from './extension-registry.js';

// ── Error Hints ────────────────────────────────────────────────────────────

export function getErrorHint(error: string): string | null {
  const lower = error.toLowerCase();
  if (lower.includes('api key') || lower.includes('authentication') || lower.includes('401')) {
    return 'Check your API key in config or environment variables.';
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return 'Rate limited. Wait a moment and try again.';
  }
  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('fetch failed')) {
    return 'Network error. Check your internet connection.';
  }
  if (lower.includes('context') || lower.includes('too long') || lower.includes('token')) {
    return 'Context limit exceeded. Try /clear to start fresh.';
  }
  return null;
}

// ── Command Result Types ───────────────────────────────────────────────────

export type CommandResult =
  | { type: 'message'; content: string }
  | { type: 'clear' }
  | { type: 'exit' }
  | { type: 'session-loaded'; sessionId: string; content: string; messages: ChatMessage[]; tokenUsage: TokenUsage }
  | { type: 'session-saved'; sessionId: string; content: string }
  | { type: 'model-switched'; provider: string; model: string; content: string }
  | { type: 'agent-switched'; agent: AgentConfig; content: string }
  | { type: 'error'; content: string }
  | { type: 'unknown-command'; command: string }
  | { type: 'not-a-command' };

// ── Command Context ────────────────────────────────────────────────────────

export interface CommandContext {
  messages: ChatMessage[];
  tokenUsage: TokenUsage;
  config: ResolvedConfig;
  currentSessionId: string | null;
  activeProvider: string;
  activeModelName: string;
  agentName: string;
  agentDescription: string;
}

// ── Dynamic Help Text ──────────────────────────────────────────────────────

export function generateHelpText(commands: Map<string, CommandDefinition>): string {
  const lines = ['Available commands:', ''];
  for (const [name, def] of commands) {
    lines.push(`  /${name.padEnd(16)} ${def.description}`);
  }
  return lines.join('\n');
}

// ── Command Handler ────────────────────────────────────────────────────────

export function handleCommand(input: string, context: CommandContext, registry?: ExtensionRegistry): CommandResult {
  if (!input.startsWith('/')) {
    return { type: 'not-a-command' };
  }

  const [cmd, ...rest] = input.slice(1).split(/\s+/);
  const arg = rest.join(' ');

  if (registry) {
    const commands = registry.collectCommands();

    // Special-case /help: generate dynamically from registered commands
    if (cmd === 'help') {
      return { type: 'message', content: generateHelpText(commands) };
    }

    const definition = commands.get(cmd);
    if (definition) {
      return definition.execute(arg, context);
    }

    return { type: 'unknown-command', command: cmd };
  }

  // Fallback for contexts without a registry (tests, etc.)
  return { type: 'unknown-command', command: cmd };
}
