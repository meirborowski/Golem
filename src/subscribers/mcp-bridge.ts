/**
 * McpBridge subscriber — Manages MCP server connections and tool discovery.
 *
 * Listens: ui:ready
 * Emits:   mcp:connecting, mcp:connected, mcp:error, mcp:disconnected, tool:registered
 */

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import type { EventBus, Unsubscribe } from '../bus/event-bus.js';
import { createEvent } from '../bus/helpers.js';
import type { McpServerConfig, ResolvedConfig } from '../core/types.js';
import type { ToolExecutor } from './tool-executor.js';
import { logger } from '../utils/logger.js';

function isStdioConfig(config: McpServerConfig): config is { command: string; args?: string[]; env?: Record<string, string> } {
  return 'command' in config;
}

function resolveStdioCommand(command: string, args?: string[]): { command: string; args: string[] } {
  if (process.platform !== 'win32') {
    return { command, args: args ?? [] };
  }
  return { command: 'cmd.exe', args: ['/c', command, ...(args ?? [])] };
}

export class McpBridge {
  private clients: MCPClient[] = [];
  private disposers: Unsubscribe[] = [];

  constructor(
    private bus: EventBus,
    private config: ResolvedConfig,
    private toolExecutor: ToolExecutor,
  ) {
    this.disposers.push(
      bus.on('ui:ready', () => { void this.connectAll(); }),
    );
  }

  /** Connect to all configured MCP servers. */
  private async connectAll(): Promise<void> {
    const servers = this.config.mcpServers;
    if (!servers || Object.keys(servers).length === 0) return;

    // Connect to all servers in parallel
    const promises = Object.entries(servers).map(([name, config]) =>
      this.connectServer(name, config),
    );

    await Promise.allSettled(promises);
  }

  private async connectServer(serverName: string, serverConfig: McpServerConfig): Promise<void> {
    await this.bus.emit(createEvent('mcp:connecting', { serverName }));

    try {
      let client: MCPClient;

      if (isStdioConfig(serverConfig)) {
        const resolved = resolveStdioCommand(serverConfig.command, serverConfig.args);
        const transport = new StdioMCPTransport({
          command: resolved.command,
          args: resolved.args,
          env: serverConfig.env ? { ...process.env, ...serverConfig.env } as Record<string, string> : undefined,
          stderr: 'pipe',
        });

        client = await createMCPClient({
          transport,
          name: `golem-mcp-${serverName}`,
        });
      } else {
        client = await createMCPClient({
          transport: {
            type: 'sse',
            url: serverConfig.url,
            headers: serverConfig.headers,
          },
          name: `golem-mcp-${serverName}`,
        });
      }

      this.clients.push(client);

      // Discover tools
      const serverTools = await client.tools();
      let toolCount = 0;

      for (const [toolName, toolDef] of Object.entries(serverTools)) {
        const namespacedName = `${serverName}_${toolName}`;
        const description = toolDef.description ?? `MCP tool from ${serverName}`;

        // Register the tool definition with the ToolExecutor
        this.toolExecutor.registerTool(namespacedName, toolDef);

        // Emit tool:registered event so PromptBuilder and others can react
        await this.bus.emit(createEvent('tool:registered', {
          toolName: namespacedName,
          source: 'mcp',
          description,
          mcpServer: serverName,
        }));

        toolCount++;
      }

      logger.info(`MCP server "${serverName}": connected, ${toolCount} tool(s) discovered`);
      await this.bus.emit(createEvent('mcp:connected', { serverName, toolCount }));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`MCP server "${serverName}" failed to connect: ${errMsg}`);
      await this.bus.emit(createEvent('mcp:error', { serverName, error: errMsg }));
    }
  }

  /** Close all MCP client connections. */
  async close(): Promise<void> {
    for (const client of this.clients) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
    this.clients = [];
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    void this.close();
  }
}
