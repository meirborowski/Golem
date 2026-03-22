import type { McpManager } from './mcp-client.js';

let activeManager: McpManager | null = null;

export function setActiveMcpManager(manager: McpManager | null): void {
  activeManager = manager;
}

export async function cleanupMcp(): Promise<void> {
  if (activeManager) {
    await activeManager.close();
    activeManager = null;
  }
}
