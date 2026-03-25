/**
 * Bootstrap — Creates the event bus, all subscribers, and registers extensions.
 *
 * This is the single setup function that wires the new event bus architecture.
 * It coexists with the old AppContextProvider during the migration period.
 */

import { createEventBus, type GolemEventBus } from './bus/index.js';
import { createEvent } from './bus/helpers.js';
import { createAllSubscribers, type AllSubscribers } from './subscribers/index.js';
import { normalizeNullableParams } from './core/tool-registry.js';
import type { ResolvedConfig } from './core/types.js';
import type { AgentConfig } from './agents/agent-types.js';
import type { ExtensionRegistry } from './core/extension-registry.js';
import { logger } from './utils/logger.js';

export interface GolemBus {
  bus: GolemEventBus;
  subscribers: AllSubscribers;
}

/**
 * Create the event bus, all subscribers, and register extensions.
 */
export function createGolemBus(
  config: ResolvedConfig,
  agent: AgentConfig,
  registry: ExtensionRegistry,
): GolemBus {
  const bus = createEventBus();

  // Wire error handler
  bus.onError = (error, event) => {
    logger.error(`Bus handler error on ${event.type}`, { error: error.message });
  };

  // Add debug interceptor when debug mode is enabled
  if (config.debug) {
    bus.use(async (event, next) => {
      logger.debug(`[bus] ${event.type}`, { id: event.id });
      await next();
    });
  }

  // Create all subscribers
  const subscribers = createAllSubscribers(bus, config, agent, registry);

  // Register providers from extensions
  const providers = registry.collectProviders();
  providers.forEach((entry, _name) => {
    subscribers.configManager.registerProvider(entry);
  });

  // Register builtin tools from extensions, normalized
  const rawTools = registry.collectTools(config.cwd, config);
  const allowedNames = agent.tools ? new Set(agent.tools) : null;

  for (const [name, toolDef] of Object.entries(rawTools)) {
    if (allowedNames && !allowedNames.has(name)) continue;
    const normalized = normalizeNullableParams(toolDef);
    subscribers.toolExecutor.registerTool(name, normalized);

    // Emit tool:registered so PromptBuilder picks it up
    void bus.emit(createEvent('tool:registered', {
      toolName: name,
      source: 'builtin',
      description: toolDef.description ?? '',
    }));
  }

  return { bus, subscribers };
}
