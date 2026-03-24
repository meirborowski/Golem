import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { saveSession, loadSession, listSessions, exportToMarkdown } from '../core/session.js';
import { listProviders, getProvider } from '../core/provider-registry.js';
import { loadAgent, listAgentNames } from '../agents/agent-loader.js';
import type { GolemExtension, CommandDefinition } from '../core/extension.js';
import type { CommandContext, CommandResult } from '../core/command-handler.js';

const commands: Record<string, CommandDefinition> = {
  help: {
    description: 'Show this help message',
    // Placeholder — the real help command is injected by the command handler
    // because it needs access to the full command map. See command-handler.ts.
    execute: (arg, context) => ({ type: 'message', content: 'Use /help for available commands.' }),
  },

  exit: {
    description: 'Exit Golem',
    execute: (arg, context) => {
      if (context.messages.length > 0) {
        try {
          saveSession(context.messages, context.tokenUsage, context.config, context.currentSessionId ?? undefined);
        } catch {
          // Silently ignore save errors on exit
        }
      }
      return { type: 'exit' };
    },
  },

  quit: {
    description: 'Exit Golem',
    execute: (arg, context) => commands['exit'].execute(arg, context),
  },

  clear: {
    description: 'Clear conversation history',
    execute: () => ({ type: 'clear' }),
  },

  model: {
    description: 'Show or switch model (e.g. /model gpt-4o)',
    execute: (arg, context) => {
      if (!arg) {
        return { type: 'message', content: `Current model: ${context.activeProvider}/${context.activeModelName}` };
      }
      let newProvider = context.activeProvider;
      let newModel = arg;
      if (arg.includes('/')) {
        const parts = arg.split('/');
        newProvider = parts[0];
        newModel = parts.slice(1).join('/');
      }
      return { type: 'model-switched', provider: newProvider, model: newModel, content: `Switched to ${newProvider}/${newModel}` };
    },
  },

  models: {
    description: 'List available providers and their default models',
    execute: (arg, context) => {
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
    },
  },

  provider: {
    description: 'Show or switch provider',
    execute: (arg, context) => {
      if (!arg) {
        return { type: 'message', content: `Current provider: ${context.activeProvider}` };
      }
      const entry = getProvider(arg);
      if (!entry) {
        return { type: 'error', content: `Unknown provider: "${arg}"` };
      }
      return { type: 'model-switched', provider: arg, model: entry.defaultModel, content: `Switched to ${arg}/${entry.defaultModel}` };
    },
  },

  save: {
    description: 'Save current session',
    execute: (arg, context) => {
      if (context.messages.length === 0) {
        return { type: 'message', content: 'Nothing to save — no messages in this session.' };
      }
      try {
        const session = saveSession(context.messages, context.tokenUsage, context.config, context.currentSessionId ?? undefined);
        return { type: 'session-saved', sessionId: session.id, content: `Session saved: ${session.id} (${session.messages.length} messages)` };
      } catch (err) {
        return { type: 'error', content: `Failed to save: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  },

  load: {
    description: 'Load a saved session (latest if no id)',
    execute: (arg, context) => {
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
    },
  },

  history: {
    description: 'List saved sessions',
    execute: (arg, context) => {
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
    },
  },

  export: {
    description: 'Export conversation as markdown',
    execute: (arg, context) => {
      if (context.messages.length === 0) {
        return { type: 'message', content: 'Nothing to export — no messages in this session.' };
      }
      try {
        const markdown = exportToMarkdown(context.messages, context.activeProvider, context.activeModelName);
        const filename = arg || `golem-export-${new Date().toISOString().slice(0, 10)}.md`;
        const filePath = resolve(context.config.cwd, filename);
        writeFileSync(filePath, markdown, 'utf-8');
        return { type: 'message', content: `Exported ${context.messages.length} messages to ${filePath}` };
      } catch (err) {
        return { type: 'error', content: `Failed to export: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  },

  agent: {
    description: 'Show or switch agent config',
    execute: (arg, context) => {
      if (!arg) {
        return { type: 'message', content: `Current agent: ${context.agentName} — ${context.agentDescription}` };
      }
      const newAgent = loadAgent(arg, context.config.cwd);
      if (!newAgent) {
        return { type: 'message', content: `Agent not found: "${arg}". Use /agents to list available agents.` };
      }
      return { type: 'agent-switched', agent: newAgent, content: `Switched to agent: ${newAgent.name} — ${newAgent.description}` };
    },
  },

  agents: {
    description: 'List available agents',
    execute: (arg, context) => {
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
    },
  },
};

/**
 * Built-in commands extension. Registers all core slash commands.
 */
export const builtinCommandsExtension: GolemExtension = {
  name: 'builtin-commands',
  commands,
};
