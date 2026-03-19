import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ── Memory directory ────────────────────────────────────────────────────────

function getGolemBaseDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];

  if (xdg) {
    return join(xdg, 'golem');
  } else if (process.platform === 'win32') {
    return join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), 'golem');
  } else {
    return join(homedir(), '.config', 'golem');
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ── Memory store type ───────────────────────────────────────────────────────

interface MemoryStore {
  [key: string]: string;
}

// ── File paths ──────────────────────────────────────────────────────────────

function getGlobalMemoryPath(): string {
  return join(getGolemBaseDir(), 'memory.json');
}

function getProjectMemoryPath(cwd: string): string {
  return join(cwd, '.golem', 'memory.json');
}

// ── Read/Write helpers ──────────────────────────────────────────────────────

function loadStore(filePath: string): MemoryStore {
  if (!existsSync(filePath)) return {};

  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as MemoryStore;
  } catch {
    return {};
  }
}

function saveStore(filePath: string, store: MemoryStore): void {
  const dir = join(filePath, '..');
  ensureDir(dir);
  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

// ── Public API ──────────────────────────────────────────────────────────────

export type MemoryScope = 'global' | 'project';

function getPath(scope: MemoryScope, cwd: string): string {
  return scope === 'global' ? getGlobalMemoryPath() : getProjectMemoryPath(cwd);
}

export function memorySet(key: string, value: string, scope: MemoryScope, cwd: string): void {
  const filePath = getPath(scope, cwd);
  const store = loadStore(filePath);
  store[key] = value;
  saveStore(filePath, store);
}

export function memoryGet(key: string, scope: MemoryScope, cwd: string): string | null {
  const filePath = getPath(scope, cwd);
  const store = loadStore(filePath);
  return store[key] ?? null;
}

export function memoryDelete(key: string, scope: MemoryScope, cwd: string): boolean {
  const filePath = getPath(scope, cwd);
  const store = loadStore(filePath);
  if (!(key in store)) return false;
  delete store[key];
  saveStore(filePath, store);
  return true;
}

export function memoryList(scope: MemoryScope, cwd: string): Record<string, string> {
  const filePath = getPath(scope, cwd);
  return loadStore(filePath);
}

export function memoryClear(scope: MemoryScope, cwd: string): number {
  const filePath = getPath(scope, cwd);
  const store = loadStore(filePath);
  const count = Object.keys(store).length;
  saveStore(filePath, {});
  return count;
}

/**
 * Load all memory entries (both global and project) for inclusion in the system prompt.
 * Returns null if no memories exist.
 */
export function loadMemoryForPrompt(cwd: string): string | null {
  const global = memoryList('global', cwd);
  const project = memoryList('project', cwd);

  const globalEntries = Object.entries(global);
  const projectEntries = Object.entries(project);

  if (globalEntries.length === 0 && projectEntries.length === 0) return null;

  const parts: string[] = [];

  if (projectEntries.length > 0) {
    parts.push('Project memory:');
    for (const [key, value] of projectEntries) {
      parts.push(`  ${key}: ${value}`);
    }
  }

  if (globalEntries.length > 0) {
    parts.push('Global memory:');
    for (const [key, value] of globalEntries) {
      parts.push(`  ${key}: ${value}`);
    }
  }

  return parts.join('\n');
}
