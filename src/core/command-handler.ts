import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { saveSession, loadSession, listSessions, exportToMarkdown } from './session.js';
import { listProviders, getProvider } from './provider-registry.js';
import { loadAgent, listAgentNames } from '../agents/agent-loader.js';
import type { AgentConfig } from '../agents/agent-types.js';
import type { ChatMessage, TokenUsage, ResolvedConfig } from './types.js';

// ── Help Text ──────────────────────────────────────────────────────────────

export const HELP_TEXT = [
  'Available commands:',
  '  /help              Show this help message',
  '  /clear             Clear conversation history',
  '  /model [name]      Show or switch model (e.g. /model gpt-4o, /model openai/gpt-4o)',
  '  /models            List available providers and their default models',
  '  /provider [name]   Show or switch provider',
  '  /save              Save current session',
  '  /load [id]         Load a saved session (latest if no id)',
  '  /history           List saved sessions',
  '  /export [path]     Export conversation as markdown',
  '  /agent [name]      Show or switch agent config',
  '  /agents            List available agents',
  '  /exit, /quit       Exit Golem',
].join('\n');

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

// ── Command Handler ────────────────────────────────────────────────────────

export function handleCommand(input: string, context: CommandContext): CommandResult {
  if (!input.startsWith('/')) {
    return { type: 'not-a-command' };
  }

  const [cmd, ...rest] = input.slice(1).split(/\s+/);
  const arg = rest.join(' ');

  switch (cmd) {
    case 'help':
      return { type: 'message', content: HELP_TEXT };

    case 'exit':
    case 'quit': {
      // Auto-save before exit if there are messages
      if (context.messages.length > 0) {
        try {
          saveSession(context.messages, context.tokenUsage, context.config, context.currentSessionId ?? undefined);
        } catch {
          // Silently ignore save errors on exit
        }
      }
      return { type: 'exit' };
    }

    case 'clear':
      return { type: 'clear' };

    case 'model': {
      if (!arg) {
        return {
          type: 'message',
          content: `Current model: ${context.activeProvider}/${context.activeModelName}`,
        };
      }

      // Support "provider/model" or just "model" (stays on current provider)
      let newProvider = context.activeProvider;
      let newModel = arg;

      if (arg.includes('/')) {
        const parts = arg.split('/');
        newProvider = parts[0];
        newModel = parts.slice(1).join('/');
      }

      return {
        type: 'model-switched',
        provider: newProvider,
        model: newModel,
        content: `Switched to ${newProvider}/${newModel}`,
      };
    }

    case 'models': {
      const providers = listProviders();
      const lines = ['Available providers and default models:', ''];
      for (const name of providers) {
        const entry = getProvider(name);
        if (entry) {
          const active = name === context.activeProvider ? ' (active)' : '';
          lines.push(`  ${name}${active} — default: ${entry.defaultModel}`);
        }
      }
      lines.push('');
      lines.push('Usage: /model <model-name> or /model <provider>/<model>');
      return { type: 'message', content: lines.join('\n') };
    }

    case 'provider': {
      if (!arg) {
        return {
          type: 'message',
          content: `Current provider: ${context.activeProvider}`,
        };
      }

      const entry = getProvider(arg);
      if (!entry) {
        return { type: 'error', content: `Unknown provider: "${arg}"` };
      }

      return {
        type: 'model-switched',
        provider: arg,
        model: entry.defaultModel,
        content: `Switched to ${arg}/${entry.defaultModel}`,
      };
    }

    case 'save': {
      if (context.messages.length === 0) {
        return { type: 'message', content: 'Nothing to save — no messages in this session.' };
      }

      try {
        const session = saveSession(
          context.messages,
          context.tokenUsage,
          context.config,
          context.currentSessionId ?? undefined,
        );
        return {
          type: 'session-saved',
          sessionId: session.id,
          content: `Session saved: ${session.id} (${session.messages.length} messages)`,
        };
      } catch (err) {
        return { type: 'error', content: `Failed to save: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'load': {
      try {
        let sessionId = arg;
        if (!sessionId) {
          const sessions = listSessions(1);
          if (sessions.length === 0) {
            return { type: 'message', content: 'No saved sessions found.' };
          }
          sessionId = sessions[0].id;
        }

        const session = loadSession(sessionId);
        if (!session) {
          return { type: 'message', content: `Session not found: ${sessionId}` };
        }

        return {
          type: 'session-loaded',
          sessionId: session.id,
          content: `Loaded session: ${session.id} (${session.messages.length} messages, ${session.provider}/${session.model})`,
          messages: session.messages,
          tokenUsage: session.tokenUsage,
        };
      } catch (err) {
        return { type: 'error', content: `Failed to load: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'history': {
      const sessions = listSessions();
      if (sessions.length === 0) {
        return { type: 'message', content: 'No saved sessions found.' };
      }

      const lines = ['Saved sessions:', ''];
      for (const s of sessions) {
        const date = new Date(s.updatedAt).toLocaleString();
        const active = s.id === context.currentSessionId ? ' (current)' : '';
        lines.push(`  ${s.id}${active}`);
        lines.push(`    ${date} | ${s.provider}/${s.model} | ${s.messageCount} msgs`);
        lines.push(`    ${s.preview}`);
        lines.push('');
      }
      lines.push('Use /load <id> to load a session.');
      return { type: 'message', content: lines.join('\n') };
    }

    case 'export': {
      if (context.messages.length === 0) {
        return { type: 'message', content: 'Nothing to export — no messages in this session.' };
      }

      try {
        const markdown = exportToMarkdown(context.messages, context.activeProvider, context.activeModelName);
        const filename = arg || `golem-export-${new Date().toISOString().slice(0, 10)}.md`;
        const filePath = resolve(context.config.cwd, filename);
        writeFileSync(filePath, markdown, 'utf-8');
        return {
          type: 'message',
          content: `Exported ${context.messages.length} messages to ${filePath}`,
        };
      } catch (err) {
        return { type: 'error', content: `Failed to export: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'agent': {
      if (!arg) {
        return {
          type: 'message',
          content: `Current agent: ${context.agentName} — ${context.agentDescription}`,
        };
      }

      const newAgent = loadAgent(arg, context.config.cwd);
      if (!newAgent) {
        return {
          type: 'message',
          content: `Agent not found: "${arg}". Use /agents to list available agents.`,
        };
      }

      return {
        type: 'agent-switched',
        agent: newAgent,
        content: `Switched to agent: ${newAgent.name} — ${newAgent.description}`,
      };
    }

    case 'agents': {
      const names = listAgentNames(context.config.cwd);
      if (names.length === 0) {
        return { type: 'message', content: 'No agents found.' };
      }

      const lines = ['Available agents:', ''];
      for (const name of names) {
        const loaded = loadAgent(name, context.config.cwd);
        const active = name === context.agentName ? ' (active)' : '';
        lines.push(`  ${name}${active}${loaded ? ` — ${loaded.description}` : ''}`);
      }
      lines.push('');
      lines.push('Usage: /agent <name>');
      return { type: 'message', content: lines.join('\n') };
    }

    default:
      return { type: 'unknown-command', command: cmd };
  }
}
