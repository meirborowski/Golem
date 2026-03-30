import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IAgentRegistry } from "#core/interfaces/IAgentRegistry.js";
import type { AgentDefinition, AgentModelOverride, AgentPipelineOverride } from "#core/entities/AgentDefinition.js";

export class FileAgentRegistry implements IAgentRegistry {
  private agents = new Map<string, AgentDefinition>();
  private defaultName = "code";

  constructor(
    private builtInDir: string,
    private projectDir: string,
  ) {}

  async loadAll(): Promise<void> {
    this.agents.clear();

    // Load built-in agents first
    await this.loadFromDirectory(this.builtInDir);

    // Project agents override built-in by name
    await this.loadFromDirectory(this.projectDir);
  }

  getAll(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  get(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  getDefault(): AgentDefinition {
    const agent = this.agents.get(this.defaultName) ?? this.getAll()[0];
    if (!agent) {
      throw new Error("No agents loaded. Ensure agent .md files exist in the agents directory.");
    }
    return agent;
  }

  private async loadFromDirectory(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return; // Directory doesn't exist — that's fine
    }

    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;

      const filePath = join(dir, entry);
      const raw = await readFile(filePath, "utf-8");
      const definition = this.parse(raw, filePath);

      if (definition) {
        this.agents.set(definition.name, definition);
      }
    }
  }

  private parse(raw: string, sourceFile: string): AgentDefinition | null {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) return null;

    const frontmatterRaw = match[1];
    const body = match[2].trim();
    const fm = this.parseFrontmatter(frontmatterRaw);

    const name = fm.name;
    const description = fm.description;
    if (typeof name !== "string" || typeof description !== "string") return null;

    let tools: string[] | undefined;
    if (Array.isArray(fm.tools)) {
      tools = fm.tools.filter((t): t is string => typeof t === "string");
    }

    let model: AgentModelOverride | undefined;
    if (fm.model && typeof fm.model === "object" && !Array.isArray(fm.model)) {
      const m = fm.model as Record<string, unknown>;
      if (typeof m.provider === "string" && typeof m.model === "string") {
        model = { provider: m.provider, model: m.model };
      }
    }

    let pipeline: AgentPipelineOverride | undefined;
    if (fm.pipeline && typeof fm.pipeline === "object" && !Array.isArray(fm.pipeline)) {
      const p = fm.pipeline as Record<string, unknown>;
      pipeline = {};
      if (Array.isArray(p.pre)) pipeline.pre = p.pre.filter((s): s is string => typeof s === "string");
      if (Array.isArray(p.post)) pipeline.post = p.post.filter((s): s is string => typeof s === "string");
    }

    const maxSteps = typeof fm.maxSteps === "number" ? fm.maxSteps : undefined;

    return { name, description, systemPrompt: body, tools, model, pipeline, maxSteps, sourceFile };
  }

  /**
   * Minimal YAML-subset parser for agent frontmatter.
   * Supports: string values, number values, flat arrays, one-level nested objects.
   */
  private parseFrontmatter(raw: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = raw.split(/\r?\n/);

    let currentKey: string | null = null;
    let currentArray: unknown[] | null = null;
    let currentObject: Record<string, unknown> | null = null;

    for (const line of lines) {
      // Blank or comment line
      if (line.trim() === "" || line.trim().startsWith("#")) {
        continue;
      }

      // Array item (indented "- value")
      const arrayItemMatch = line.match(/^  - (.+)$/);
      if (arrayItemMatch && currentKey && currentArray) {
        currentArray.push(this.parseValue(arrayItemMatch[1]));
        continue;
      }

      // Nested object key (indented "key: value")
      const nestedMatch = line.match(/^  (\w+):\s*(.+)$/);
      if (nestedMatch && currentKey && currentObject) {
        currentObject[nestedMatch[1]] = this.parseValue(nestedMatch[2]);
        continue;
      }

      // Flush any pending collection
      if (currentKey && currentArray) {
        result[currentKey] = currentArray;
        currentArray = null;
      }
      if (currentKey && currentObject) {
        result[currentKey] = currentObject;
        currentObject = null;
      }

      // Top-level key-value
      const kvMatch = line.match(/^(\w+):\s*(.*)$/);
      if (!kvMatch) continue;

      currentKey = kvMatch[1];
      const rawValue = kvMatch[2].trim();

      if (rawValue === "" || rawValue === ">-") {
        // Could be start of array, object, or multiline string
        // We'll determine by looking at the next line, so just mark the key
        // For >- (folded block), collect subsequent indented lines as string
        if (rawValue === ">-") {
          // Collect folded block scalar
          const blockLines: string[] = [];
          const idx = lines.indexOf(line);
          for (let i = idx + 1; i < lines.length; i++) {
            if (lines[i].match(/^\s{2,}/)) {
              blockLines.push(lines[i].trim());
            } else {
              break;
            }
          }
          result[currentKey] = blockLines.join(" ");
          currentKey = null;
        } else {
          // Peek at next lines to decide array vs object
          const idx = lines.indexOf(line);
          const nextLine = idx + 1 < lines.length ? lines[idx + 1] : "";
          if (nextLine.match(/^  - /)) {
            currentArray = [];
          } else if (nextLine.match(/^  \w+:/)) {
            currentObject = {};
          }
        }
      } else {
        // Inline array syntax: [item1, item2]
        const inlineArrayMatch = rawValue.match(/^\[(.+)]$/);
        if (inlineArrayMatch) {
          result[currentKey] = inlineArrayMatch[1].split(",").map(s => this.parseValue(s.trim()));
          currentKey = null;
        } else {
          result[currentKey] = this.parseValue(rawValue);
          currentKey = null;
        }
      }
    }

    // Flush trailing collection
    if (currentKey && currentArray) result[currentKey] = currentArray;
    if (currentKey && currentObject) result[currentKey] = currentObject;

    return result;
  }

  private parseValue(raw: string): string | number | boolean {
    // Remove surrounding quotes
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    if (raw === "true") return true;
    if (raw === "false") return false;
    const num = Number(raw);
    if (!Number.isNaN(num) && raw !== "") return num;
    return raw;
  }
}
