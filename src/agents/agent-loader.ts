import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { AgentConfig } from './agent-types.js';
import { logger } from '../utils/logger.js';

const VALID_STOP_CONDITIONS = new Set(['default', 'agent-done-only', 'single-turn']);

// ── Frontmatter parsing ────────────────────────────────────────────────────

interface RawFrontmatter {
  name?: string;
  description?: string;
  tools?: string | string[] | null;
  maxTurns?: number;
  maxConsecutiveErrors?: number;
  continuationPrompt?: string;
  stopCondition?: string;
}

function parseFrontmatter(raw: string): { frontmatter: RawFrontmatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const yamlBlock = match[1]!;
  const body = match[2]!;

  const frontmatter: Record<string, unknown> = {};
  for (const line of yamlBlock.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value: unknown = trimmed.slice(colonIdx + 1).trim();

    // Parse simple types
    if (value === 'null' || value === '~') {
      value = null;
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (/^\d+$/.test(value as string)) {
      value = parseInt(value as string, 10);
    } else if ((value as string).startsWith('[') && (value as string).endsWith(']')) {
      // Simple inline array: [a, b, c]
      const inner = (value as string).slice(1, -1);
      value = inner
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    frontmatter[key] = value;
  }

  return { frontmatter: frontmatter as RawFrontmatter, body };
}

// ── Markdown section parsing ───────────────────────────────────────────────

function parseSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = body.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (currentKey) {
        sections[currentKey] = currentLines.join('\n').trim();
      }
      currentKey = headingMatch[1]!.toLowerCase();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Save last section
  if (currentKey) {
    sections[currentKey] = currentLines.join('\n').trim();
  }

  return sections;
}

// ── Agent config assembly ──────────────────────────────────────────────────

function parseAgentFile(filePath: string): AgentConfig | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const sections = parseSections(body);

    const nameFromFile = basename(filePath, '.md');
    const name = frontmatter.name ?? nameFromFile;
    const description = frontmatter.description ?? '';

    let tools: string[] = [];
    if (Array.isArray(frontmatter.tools)) {
      tools = frontmatter.tools;
    } else if (typeof frontmatter.tools === 'string' && frontmatter.tools !== 'null' && frontmatter.tools !== '') {
      tools = frontmatter.tools.split(',').map((s) => s.trim());
    }

    if (tools.length === 0) {
      logger.warn(`Agent "${name}" has no tools defined in frontmatter — it will have no tool access`);
    }

    const stopCondition = VALID_STOP_CONDITIONS.has(frontmatter.stopCondition ?? '')
      ? (frontmatter.stopCondition as AgentConfig['stopCondition'])
      : 'default';

    return {
      name,
      description,
      sections,
      tools,
      toolMeta: {}, // populated when tools are created
      maxTurns: frontmatter.maxTurns ?? 20,
      maxConsecutiveErrors: frontmatter.maxConsecutiveErrors ?? 3,
      continuationPrompt:
        frontmatter.continuationPrompt ??
        'Continue working on the task. If you are done, call the agentDone tool.',
      stopCondition,
    };
  } catch (error) {
    logger.error(`Failed to load agent from ${filePath}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ── Directory resolution ───────────────────────────────────────────────────

function getBundledConfigDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), 'configs');
}

function getGlobalAgentDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  if (xdg) return join(xdg, 'golem', 'agents');

  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'];
    if (appData) return join(appData, 'golem', 'agents');
  }

  return join(homedir(), '.config', 'golem', 'agents');
}

function getProjectAgentDir(cwd: string): string | null {
  let dir = resolve(cwd);
  const root = dirname(dir) === dir ? dir : undefined;

  while (true) {
    const agentDir = join(dir, '.golem', 'agents');
    if (existsSync(agentDir)) return agentDir;

    const parent = dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }

  return null;
}

function listMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Load a single agent by name.
 * Resolution: project .golem/agents/ > global ~/.config/golem/agents/ > bundled configs.
 */
export function loadAgent(name: string, cwd: string): AgentConfig | null {
  const filename = `${name}.md`;

  // 1. Project-level
  const projectDir = getProjectAgentDir(cwd);
  if (projectDir) {
    const projectFile = join(projectDir, filename);
    if (existsSync(projectFile)) {
      logger.debug(`Loading agent "${name}" from project: ${projectFile}`);
      return parseAgentFile(projectFile);
    }
  }

  // 2. Global
  const globalFile = join(getGlobalAgentDir(), filename);
  if (existsSync(globalFile)) {
    logger.debug(`Loading agent "${name}" from global: ${globalFile}`);
    return parseAgentFile(globalFile);
  }

  // 3. Bundled
  const bundledFile = join(getBundledConfigDir(), filename);
  if (existsSync(bundledFile)) {
    logger.debug(`Loading agent "${name}" from bundled: ${bundledFile}`);
    return parseAgentFile(bundledFile);
  }

  return null;
}

/**
 * Load all available agents. Project overrides global, global overrides bundled.
 * Returns a Map keyed by agent name.
 */
export function loadAgents(cwd: string): Map<string, AgentConfig> {
  const agents = new Map<string, AgentConfig>();

  // Load bundled first (lowest priority)
  for (const file of listMdFiles(getBundledConfigDir())) {
    const agent = parseAgentFile(file);
    if (agent) agents.set(agent.name, agent);
  }

  // Global overrides bundled
  for (const file of listMdFiles(getGlobalAgentDir())) {
    const agent = parseAgentFile(file);
    if (agent) agents.set(agent.name, agent);
  }

  // Project overrides global
  const projectDir = getProjectAgentDir(cwd);
  if (projectDir) {
    for (const file of listMdFiles(projectDir)) {
      const agent = parseAgentFile(file);
      if (agent) agents.set(agent.name, agent);
    }
  }

  return agents;
}

/**
 * List names of all available agents.
 */
export function listAgentNames(cwd: string): string[] {
  return [...loadAgents(cwd).keys()].sort();
}
