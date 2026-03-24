import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import type { ToolSet } from './tool-registry.js';
import type { McpServerConfig, ApprovalCallback, ApprovalConfig, ResolvedConfig } from './types.js';
import type { ToolMiddleware } from './middleware.js';
import { applyMiddleware } from './middleware.js';
import { createApprovalMiddleware } from './middlewares/approval.js';
import { logger } from '../utils/logger.js';

export interface McpToolDescription {
  name: string;
  description: string;
  server: string;
}

export interface McpManager {
  /** All discovered MCP tools, namespaced and approval-wrapped. */
  tools: ToolSet;
  /** Descriptions for system prompt listing. */
  toolDescriptions: McpToolDescription[];
  /** Close all MCP client connections. */
  close(): Promise<void>;
}

function isStdioConfig(config: McpServerConfig): config is { command: string; args?: string[]; env?: Record<string, string> } {
  return 'command' in config;
}

/**
 * On Windows, `child_process.spawn` with `shell: false` (hardcoded in the MCP SDK)
 * can't find commands like `npx`, `npm`, etc. because they are `.cmd` batch files.
 * We rewrite the command to go through `cmd.exe /c` so it resolves correctly.
 * Returns { command, args } with the corrected values.
 */
function resolveStdioCommand(command: string, args?: string[]): { command: string; args: string[] } {
  if (process.platform !== 'win32') {
    return { command, args: args ?? [] };
  }
  // On Windows, wrap everything through cmd.exe /c so .cmd scripts resolve
  return { command: 'cmd.exe', args: ['/c', command, ...(args ?? [])] };
}

export async function createMcpManager(
  servers: Record<string, McpServerConfig>,
  onApprovalNeeded?: ApprovalCallback,
  approvalConfig?: ApprovalConfig,
  config?: ResolvedConfig,
): Promise<McpManager> {
  const clients: MCPClient[] = [];
  const allTools: ToolSet = {};
  const toolDescriptions: McpToolDescription[] = [];

  for (const [serverName, serverConfig] of Object.entries(servers)) {
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

      clients.push(client);

      // Discover tools from this server
      const serverTools = await client.tools();

      for (const [toolName, toolDef] of Object.entries(serverTools)) {
        const namespacedName = `${serverName}_${toolName}`;
        const description = toolDef.description ?? `MCP tool from ${serverName}`;

        let wrappedTool = { ...toolDef };

        // Build MCP-specific approval config: per-tool override > mcpDefault > 'always'
        const mcpDefault = approvalConfig?.mcpDefault ?? 'always';
        const toolRule = approvalConfig?.tools?.[namespacedName]?.approval ?? mcpDefault;
        const mcpApprovalConfig: ApprovalConfig = {
          ...approvalConfig,
          tools: { ...approvalConfig?.tools, [namespacedName]: { approval: toolRule } },
        };

        // Apply middleware pipeline
        const middlewares: ToolMiddleware[] = [];
        if (onApprovalNeeded) {
          middlewares.push(createApprovalMiddleware(mcpApprovalConfig, onApprovalNeeded, {}));
        }
        if (middlewares.length > 0) {
          const resolvedConfig = config ?? ({ approval: mcpApprovalConfig } as ResolvedConfig);
          wrappedTool = applyMiddleware(wrappedTool, namespacedName, resolvedConfig, middlewares);
        }

        allTools[namespacedName] = wrappedTool;
        toolDescriptions.push({ name: namespacedName, description, server: serverName });
      }

      const toolCount = Object.keys(serverTools).length;
      logger.info(`MCP server "${serverName}": connected, ${toolCount} tool(s) discovered`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`MCP server "${serverName}" failed to connect: ${errMsg}`);
    }
  }

  return {
    tools: allTools,
    toolDescriptions,
    async close() {
      for (const client of clients) {
        try {
          await client.close();
        } catch {
          // Ignore close errors — process may already be gone
        }
      }
    },
  };
}
