import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import { createIgnoreFilter } from "./gitignore.js";

export function createMaxDepthTool(fs: IFileSystem) {
  const getIgnoreFilter = createIgnoreFilter(fs);

  return tool({
    description:
      "Find the maximum nesting depth in a directory. Call this BEFORE directoryTree, then pass the returned max depth as the depth parameter to directoryTree to see the full structure. Returns the deepest file path, its depth, and a depth distribution summary.",
    inputSchema: z.object({
      path: z.string().describe("Root directory path to analyze (e.g. '.' or 'src')"),
    }),
    execute: async ({ path }) => {
      try {
        const filter = await getIgnoreFilter();
        const entries = await fs.listDirectory(path, true);
        const filtered = entries.filter((e) => !filter(e.path, e.isDirectory));

        if (filtered.length === 0) {
          return `${path}/ — empty (no files after filtering)`;
        }

        const prefix = path === "." || path === "./" || path === "/"
          ? ""
          : path.replace(/\/$/, "") + "/";

        let maxDepth = 0;
        let deepestPath = "";
        const depthCounts = new Map<number, number>();

        for (const entry of filtered) {
          const relative = prefix
            ? entry.path.replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "")
            : entry.path;
          const depth = relative.split("/").filter(Boolean).length;

          depthCounts.set(depth, (depthCounts.get(depth) ?? 0) + 1);

          if (depth > maxDepth) {
            maxDepth = depth;
            deepestPath = entry.path;
          }
        }

        const distribution = Array.from(depthCounts.entries())
          .sort(([a], [b]) => a - b)
          .map(([d, count]) => `  depth ${d}: ${count} entries`)
          .join("\n");

        return `Max depth: ${maxDepth}\nDeepest: ${deepestPath}\nTotal entries: ${filtered.length}\n\nDistribution:\n${distribution}`;
      } catch (e) {
        return `Error analyzing ${path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
