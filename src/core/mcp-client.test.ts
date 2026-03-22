import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServerConfig, ApprovalCallback } from './types.js';

const createMCPClientMock = vi.hoisted(() => vi.fn());

vi.mock('@ai-sdk/mcp', () => ({
  createMCPClient: createMCPClientMock,
}));

vi.mock('@ai-sdk/mcp/mcp-stdio', () => ({
  Experimental_StdioMCPTransport: vi.fn(),
}));

// Import after mocks are set up
const { createMcpManager } = await import('./mcp-client.js');

function makeMockClient(tools: Record<string, { description?: string }>) {
  const aiSdkTools: Record<string, { description?: string; execute: () => Promise<unknown> }> = {};
  for (const [name, def] of Object.entries(tools)) {
    aiSdkTools[name] = {
      description: def.description ?? `Tool ${name}`,
      execute: vi.fn(async () => ({ success: true })),
    };
  }
  return {
    tools: vi.fn(async () => aiSdkTools),
    close: vi.fn(async () => {}),
  };
}

describe('createMcpManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty tools when no servers are configured', async () => {
    const manager = await createMcpManager({});
    expect(Object.keys(manager.tools)).toHaveLength(0);
    expect(manager.toolDescriptions).toHaveLength(0);
  });

  it('should namespace tools by server name', async () => {
    const mockClient = makeMockClient({
      create_issue: { description: 'Create a GitHub issue' },
      list_repos: { description: 'List repositories' },
    });
    createMCPClientMock.mockResolvedValue(mockClient);

    const servers: Record<string, McpServerConfig> = {
      github: { command: 'node', args: ['server.js'] },
    };

    const manager = await createMcpManager(servers);

    expect(Object.keys(manager.tools)).toEqual(['github_create_issue', 'github_list_repos']);
    expect(manager.toolDescriptions).toEqual([
      { name: 'github_create_issue', description: 'Create a GitHub issue', server: 'github' },
      { name: 'github_list_repos', description: 'List repositories', server: 'github' },
    ]);
  });

  it('should handle multiple servers', async () => {
    const githubClient = makeMockClient({
      create_issue: { description: 'Create issue' },
    });
    const dbClient = makeMockClient({
      query: { description: 'Run SQL query' },
    });

    createMCPClientMock
      .mockResolvedValueOnce(githubClient)
      .mockResolvedValueOnce(dbClient);

    const servers: Record<string, McpServerConfig> = {
      github: { command: 'node', args: ['github-server.js'] },
      database: { url: 'http://localhost:3000/mcp' },
    };

    const manager = await createMcpManager(servers);

    expect(Object.keys(manager.tools)).toEqual(['github_create_issue', 'database_query']);
    expect(manager.toolDescriptions).toHaveLength(2);
  });

  it('should skip failing servers and continue with others', async () => {
    const workingClient = makeMockClient({
      search: { description: 'Search files' },
    });

    createMCPClientMock
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValueOnce(workingClient);

    const servers: Record<string, McpServerConfig> = {
      broken: { command: 'nonexistent-binary' },
      working: { command: 'node', args: ['server.js'] },
    };

    const manager = await createMcpManager(servers);

    // Only the working server's tools should be present
    expect(Object.keys(manager.tools)).toEqual(['working_search']);
    expect(manager.toolDescriptions).toHaveLength(1);
  });

  it('should wrap tools with approval when callback is provided', async () => {
    const originalExecute = vi.fn(async () => ({ success: true, result: 'done' }));
    const mockClient = {
      tools: vi.fn(async () => ({
        my_tool: {
          description: 'A tool',
          execute: originalExecute,
        },
      })),
      close: vi.fn(async () => {}),
    };
    createMCPClientMock.mockResolvedValue(mockClient);

    const approvalCallback: ApprovalCallback = vi.fn(async () => true);

    const servers: Record<string, McpServerConfig> = {
      test: { command: 'node', args: ['server.js'] },
    };

    const manager = await createMcpManager(servers, approvalCallback);
    const wrappedTool = manager.tools['test_my_tool'];

    // Execute the wrapped tool — it should call approval first
    await wrappedTool.execute({}, { toolCallId: 'test-123' });

    expect(approvalCallback).toHaveBeenCalledWith('test_my_tool', 'test-123', {});
    expect(originalExecute).toHaveBeenCalled();
  });

  it('should deny execution when approval is rejected', async () => {
    const originalExecute = vi.fn(async () => ({ success: true }));
    const mockClient = {
      tools: vi.fn(async () => ({
        dangerous_tool: {
          description: 'Dangerous',
          execute: originalExecute,
        },
      })),
      close: vi.fn(async () => {}),
    };
    createMCPClientMock.mockResolvedValue(mockClient);

    const approvalCallback: ApprovalCallback = vi.fn(async () => false);

    const servers: Record<string, McpServerConfig> = {
      srv: { command: 'node', args: ['server.js'] },
    };

    const manager = await createMcpManager(servers, approvalCallback);
    const result = await manager.tools['srv_dangerous_tool'].execute({}, { toolCallId: 'deny-1' });

    expect(approvalCallback).toHaveBeenCalled();
    expect(originalExecute).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: 'Command denied by user' });
  });

  it('should close all clients on close()', async () => {
    const client1 = makeMockClient({ tool1: {} });
    const client2 = makeMockClient({ tool2: {} });

    createMCPClientMock
      .mockResolvedValueOnce(client1)
      .mockResolvedValueOnce(client2);

    const servers: Record<string, McpServerConfig> = {
      a: { command: 'node', args: ['a.js'] },
      b: { url: 'http://localhost:3001/mcp' },
    };

    const manager = await createMcpManager(servers);
    await manager.close();

    expect(client1.close).toHaveBeenCalled();
    expect(client2.close).toHaveBeenCalled();
  });

  it('should handle close errors gracefully', async () => {
    const client = makeMockClient({ tool: {} });
    client.close.mockRejectedValue(new Error('Already closed'));
    createMCPClientMock.mockResolvedValue(client);

    const servers: Record<string, McpServerConfig> = {
      test: { command: 'node', args: ['server.js'] },
    };

    const manager = await createMcpManager(servers);
    // Should not throw
    await expect(manager.close()).resolves.toBeUndefined();
  });

  it('should use sse transport for http configs', async () => {
    const mockClient = makeMockClient({ search: {} });
    createMCPClientMock.mockResolvedValue(mockClient);

    const servers: Record<string, McpServerConfig> = {
      api: { url: 'https://mcp.example.com/sse', headers: { Authorization: 'Bearer tok' } },
    };

    await createMcpManager(servers);

    expect(createMCPClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: {
          type: 'sse',
          url: 'https://mcp.example.com/sse',
          headers: { Authorization: 'Bearer tok' },
        },
      }),
    );
  });

  it('should use stdio transport for command configs', async () => {
    const { Experimental_StdioMCPTransport } = await import('@ai-sdk/mcp/mcp-stdio');
    const mockClient = makeMockClient({ tool: {} });
    createMCPClientMock.mockResolvedValue(mockClient);

    const servers: Record<string, McpServerConfig> = {
      local: { command: 'npx', args: ['-y', 'some-server'] },
    };

    await createMcpManager(servers);

    // On Windows, commands are wrapped through cmd.exe /c
    if (process.platform === 'win32') {
      expect(Experimental_StdioMCPTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'cmd.exe',
          args: ['/c', 'npx', '-y', 'some-server'],
          stderr: 'pipe',
        }),
      );
    } else {
      expect(Experimental_StdioMCPTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'npx',
          args: ['-y', 'some-server'],
          stderr: 'pipe',
        }),
      );
    }
  });
});
