/**
 * Subscribers index — Factory function and re-exports.
 */

export { ConfigManager } from './config-manager.js';
export { HistoryManager } from './history-manager.js';
export { PromptBuilder } from './prompt-builder.js';
export { ToolExecutor } from './tool-executor.js';
export { StreamCoordinator } from './stream-coordinator.js';
export { ApprovalGate } from './approval-gate.js';
export type { PendingApprovalInfo } from './approval-gate.js';
export { AgentLoop } from './agent-loop.js';
export { McpBridge } from './mcp-bridge.js';
export { SessionManager } from './session-manager.js';
export { CommandHandler } from './command-handler.js';

import type { EventBus } from '../bus/event-bus.js';
import type { ResolvedConfig } from '../core/types.js';
import type { AgentConfig } from '../agents/agent-types.js';
import type { ExtensionRegistry } from '../core/extension-registry.js';

import { ConfigManager } from './config-manager.js';
import { HistoryManager } from './history-manager.js';
import { PromptBuilder } from './prompt-builder.js';
import { ToolExecutor } from './tool-executor.js';
import { StreamCoordinator } from './stream-coordinator.js';
import { ApprovalGate } from './approval-gate.js';
import { AgentLoop } from './agent-loop.js';
import { McpBridge } from './mcp-bridge.js';
import { SessionManager } from './session-manager.js';
import { CommandHandler } from './command-handler.js';

export interface AllSubscribers {
  configManager: ConfigManager;
  historyManager: HistoryManager;
  promptBuilder: PromptBuilder;
  toolExecutor: ToolExecutor;
  streamCoordinator: StreamCoordinator;
  approvalGate: ApprovalGate;
  agentLoop: AgentLoop;
  mcpBridge: McpBridge;
  sessionManager: SessionManager;
  commandHandler: CommandHandler;
}

/**
 * Create all subscribers wired to the event bus.
 * Order matters: subscribers with dependencies must be created after their deps.
 */
export function createAllSubscribers(
  bus: EventBus,
  config: ResolvedConfig,
  agent: AgentConfig,
  registry: ExtensionRegistry | null = null,
): AllSubscribers {
  const configManager = new ConfigManager(bus, config);
  const historyManager = new HistoryManager(bus, config);
  const promptBuilder = new PromptBuilder(bus, config, agent, registry);
  const toolExecutor = new ToolExecutor(bus, config);
  const approvalGate = new ApprovalGate(bus);
  const agentLoop = new AgentLoop(bus);
  const sessionManager = new SessionManager(bus);

  // StreamCoordinator depends on configManager, historyManager, promptBuilder, toolExecutor
  const streamCoordinator = new StreamCoordinator(
    bus,
    configManager,
    historyManager,
    promptBuilder,
    toolExecutor,
  );

  // McpBridge depends on toolExecutor (to register discovered tools)
  const mcpBridge = new McpBridge(bus, config, toolExecutor);

  // CommandHandler depends on configManager, sessionManager, historyManager, agentLoop
  const commandHandler = new CommandHandler(
    bus,
    configManager,
    sessionManager,
    historyManager,
    agentLoop,
    registry,
  );

  return {
    configManager,
    historyManager,
    promptBuilder,
    toolExecutor,
    streamCoordinator,
    approvalGate,
    agentLoop,
    mcpBridge,
    sessionManager,
    commandHandler,
  };
}

/** Dispose all subscribers. */
export function disposeAll(subscribers: AllSubscribers): void {
  subscribers.commandHandler.dispose();
  subscribers.mcpBridge.dispose();
  subscribers.streamCoordinator.dispose();
  subscribers.agentLoop.dispose();
  subscribers.approvalGate.dispose();
  subscribers.toolExecutor.dispose();
  subscribers.promptBuilder.dispose();
  subscribers.historyManager.dispose();
  subscribers.sessionManager.dispose();
  subscribers.configManager.dispose();
}
