import type { IFileSystem } from "#core/interfaces/IFileSystem.js";

// Always ignored regardless of .gitignore
const DEFAULT_IGNORED = [".git"];

/**
 * Parse a .gitignore file into a filter function.
 * Supports: directory patterns (ending with /), glob patterns (* wildcard),
 * negation (!), and comments (#).
 */
export function parseGitignore(content: string): (path: string, isDirectory: boolean) => boolean {
  const rules: { pattern: RegExp; negated: boolean; dirOnly: boolean }[] = [];

  for (const raw of content.split("\n")) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const negated = line.startsWith("!");
    if (negated) line = line.slice(1);

    const dirOnly = line.endsWith("/");
    if (dirOnly) line = line.slice(0, -1);

    // Remove leading slash (anchored to root — we treat all paths as relative)
    if (line.startsWith("/")) line = line.slice(1);

    // Convert glob pattern to regex
    const regexStr = line
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex chars (except *)
      .replace(/\*\*/g, "{{GLOBSTAR}}")       // placeholder for **
      .replace(/\*/g, "[^/]*")                // * matches within a segment
      .replace(/{{GLOBSTAR}}/g, ".*");        // ** matches across segments

    // If pattern has no slash, it matches any path segment
    const matchAnywhere = !line.includes("/");
    const regex = matchAnywhere
      ? new RegExp(`(^|/)${regexStr}(/|$)`)
      : new RegExp(`^${regexStr}(/|$)`);

    rules.push({ pattern: regex, negated, dirOnly });
  }

  return (filePath: string, isDirectory: boolean): boolean => {
    const parts = filePath.split("/");

    // Check each ancestor path (including the full path itself)
    for (let i = 1; i <= parts.length; i++) {
      const segment = parts.slice(0, i).join("/");
      const isDir = i < parts.length || isDirectory;

      // Default ignored check
      if (i === 1 && DEFAULT_IGNORED.includes(parts[0])) return true;

      let ignored = false;
      for (const rule of rules) {
        if (rule.dirOnly && !isDir) continue;
        if (rule.pattern.test(segment)) {
          ignored = !rule.negated;
        }
      }
      if (ignored) return true;
    }
    return false;
  };
}

export type IgnoreFilter = (path: string, isDirectory: boolean) => boolean;

/**
 * Creates a lazily-initialized gitignore filter that reads .gitignore once and caches the result.
 */
export function createIgnoreFilter(fs: IFileSystem): () => Promise<IgnoreFilter> {
  let cached: IgnoreFilter | null = null;

  return async () => {
    if (cached) return cached;
    try {
      const content = await fs.readFile(".gitignore");
      cached = parseGitignore(content);
    } catch {
      cached = (filePath: string) => {
        const firstSegment = filePath.split("/")[0];
        return DEFAULT_IGNORED.includes(firstSegment);
      };
    }
    return cached;
  };
}
