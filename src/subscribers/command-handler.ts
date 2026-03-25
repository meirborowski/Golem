/**
 * CommandHandler subscriber — Routes user input: slash commands, chat, or agent tasks.
 *
 * Listens: ui:input-submitted
 * Emits:   command:executed, command:result, stream:requested, agent:started,
 *          history:cleared, config:provider-switched
 */

import type { EventBus, Unsubscribe } from '../bus/event-bus.js';
import { createEvent } from '../bus/helpers.js';
import type { ResolvedConfig } from '../core/types.js';
import type { CommandDefinition } from '../core/extension.js';
import type { ExtensionRegistry } from '../core/extension-registry.js';
import {
  handleCommand,
  getErrorHint,
  type CommandContext,
  type CommandResult,
} from '../core/command-handler.js';
import type { ConfigManager } from './config-manager.js';
import type { SessionManager } from './session-manager.js';
import type { HistoryManager } from './history-manager.js';
import type { AgentLoop } from './agent-loop.js';

export class CommandHandler {
  private disposers: Unsubscribe[] = [];

  constructor(
    private bus: EventBus,
    private configManager: ConfigManager,
    private sessionManager: SessionManager,
    private historyManager: HistoryManager,
    private agentLoop: AgentLoop,
    private registry: ExtensionRegistry | null = null,
  ) {
    this.disposers.push(
      bus.on('ui:input-submitted', (e) => { void this.handleInput(e.input); }),
    );
  }

  private async handleInput(input: string): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Check for slash commands
    if (trimmed.startsWith('/')) {
      await this.handleSlashCommand(trimmed);
      return;
    }

    // Check if an agent is configured — if so, start agent mode
    const config = this.configManager.getConfig();
    if (config.agent) {
      // Agent mode will be triggered externally (the UI/bootstrap wires this up)
      // For now, emit stream:requested for regular chat
    }

    // Regular chat — emit stream:requested
    await this.bus.emit(createEvent('stream:requested', {
      userMessage: trimmed,
      options: {},
    }));
  }

  private async handleSlashCommand(input: string): Promise<void> {
    const config = this.configManager.getConfig();

    // Build command context from current state
    const context: CommandContext = {
      messages: [], // TODO: get from history manager (ChatMessage[])
      tokenUsage: this.historyManager.getTokenUsage(),
      config,
      currentSessionId: this.sessionManager.getCurrentSessionId(),
      activeProvider: config.provider,
      activeModelName: config.model,
      agentName: config.agent ?? 'default',
      agentDescription: '',
    };

    const result = handleCommand(input, context, this.registry ?? undefined);

    await this.bus.emit(createEvent('command:executed', {
      command: input.slice(1).split(/\s+/)[0] ?? '',
      arg: input.slice(1).split(/\s+/).slice(1).join(' '),
    }));

    await this.processCommandResult(result);
  }

  private async processCommandResult(result: CommandResult): Promise<void> {
    switch (result.type) {
      case 'message':
        await this.bus.emit(createEvent('command:result', {
          command: '',
          output: result.content,
          isError: false,
        }));
        break;

      case 'error':
        await this.bus.emit(createEvent('command:result', {
          command: '',
          output: result.content,
          isError: true,
        }));
        break;

      case 'clear':
        this.historyManager.clear();
        await this.bus.emit(createEvent('history:cleared', {}));
        break;

      case 'exit':
        process.exit(0);
        break;

      case 'session-loaded':
        await this.bus.emit(createEvent('command:result', {
          command: 'load',
          output: result.content,
          isError: false,
        }));
        break;

      case 'session-saved':
        await this.bus.emit(createEvent('command:result', {
          command: 'save',
          output: result.content,
          isError: false,
        }));
        break;

      case 'model-switched':
        this.configManager.switchProvider(result.provider, result.model);
        await this.bus.emit(createEvent('command:result', {
          command: 'model',
          output: result.content,
          isError: false,
        }));
        break;

      case 'unknown-command':
        await this.bus.emit(createEvent('command:result', {
          command: result.command,
          output: `Unknown command: /${result.command}. Type /help for available commands.`,
          isError: true,
        }));
        break;

      case 'not-a-command':
        // Should not happen since we check for '/' prefix
        break;
    }
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
  }
}
