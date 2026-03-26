import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "../core/interfaces/IFileSystem.js";
import { createIgnoreFilter, type IgnoreFilter } from "./gitignore.js";

const MAX_ENTRIES = 500;

interface TreeNode {
  name: string;
  isDirectory: boolean;
  children: TreeNode[];
}

function buildTree(
  entries: { path: string; isDirectory: boolean }[],
  basePath: string,
  maxDepth: number,
): TreeNode[] {
  const root: TreeNode[] = [];

  // Normalize base path for prefix stripping
  const prefix = basePath === "." || basePath === "./" || basePath === "/"
    ? ""
    : basePath.replace(/\/$/, "") + "/";

  for (const entry of entries) {
    // Strip base path prefix to get relative path
    const relative = prefix ? entry.path.replace(new RegExp(`^${escapeRegex(prefix)}`), "") : entry.path;
    const parts = relative.split("/").filter(Boolean);

    if (parts.length === 0) continue;
    if (parts.length > maxDepth) continue;

    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const isDir = isLast ? entry.isDirectory : true;

      let node = current.find((n) => n.name === name);
      if (!node) {
        node = { name, isDirectory: isDir, children: [] };
        current.push(node);
      }
      current = node.children;
    }
  }

  sortTree(root);
  return root;
}

function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    // Directories first, then alphabetical
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.children.length > 0) sortTree(node.children);
  }
}

function renderTree(nodes: TreeNode[], prefix = ""): string[] {
  const lines: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const suffix = node.isDirectory ? "/" : "";
    lines.push(`${prefix}${connector}${node.name}${suffix}`);
    if (node.children.length > 0) {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      lines.push(...renderTree(node.children, childPrefix));
    }
  }
  return lines;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countNodes(nodes: TreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1 + countNodes(node.children);
  }
  return count;
}

export function createDirectoryTreeTool(fs: IFileSystem) {
  const getIgnoreFilter = createIgnoreFilter(fs);

  return tool({
    description:
      "Show the directory structure as a tree. Respects .gitignore. Always call maxDepth first and use its returned depth value as the depth parameter here to see the full structure.",
    inputSchema: z.object({
      path: z.string().describe("Root directory path for the tree (e.g. '.' or 'src')"),
      depth: z.number().optional().describe("Maximum depth to traverse (default: 4)"),
    }),
    execute: async ({ path, depth }) => {
      try {
        const maxDepth = depth ?? 4;
        const filter: IgnoreFilter = await getIgnoreFilter();
        const entries = await fs.listDirectory(path, true);
        const filtered = entries.filter((e) => !filter(e.path, e.isDirectory));
        const tree = buildTree(filtered, path, maxDepth);
        const total = countNodes(tree);

        if (total === 0) {
          return `${path}/ (empty)`;
        }

        const lines = renderTree(tree);
        if (total > MAX_ENTRIES) {
          const truncated = lines.slice(0, MAX_ENTRIES);
          return `${path}/\n${truncated.join("\n")}\n\n... truncated (${total} total entries). Use a smaller path or lower depth.`;
        }

        return `${path}/\n${lines.join("\n")}`;
      } catch (e) {
        return `Error building tree for ${path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
