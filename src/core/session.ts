import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { SavedSession, ChatMessage, TokenUsage, ResolvedConfig } from './types.js';

// ── Session directory ───────────────────────────────────────────────────────

function getSessionsDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  let base: string;

  if (xdg) {
    base = join(xdg, 'golem');
  } else if (process.platform === 'win32') {
    base = join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), 'golem');
  } else {
    base = join(homedir(), '.config', 'golem');
  }

  return join(base, 'sessions');
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function generateId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // 2026-03-19
  const time = now.toISOString().slice(11, 19).replace(/:/g, ''); // 214532
  const rand = Math.random().toString(36).slice(2, 6); // 4 random chars
  return `${date}_${time}_${rand}`;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function saveSession(
  messages: ChatMessage[],
  tokenUsage: TokenUsage,
  config: ResolvedConfig,
  existingId?: string,
): SavedSession {
  const dir = getSessionsDir();
  ensureDir(dir);

  const id = existingId ?? generateId();
  const now = Date.now();

  // Filter out system messages (slash command output) — they're ephemeral
  const persistMessages = messages.filter((m) => m.role !== 'system');

  const session: SavedSession = {
    id,
    createdAt: existingId ? loadSession(id)?.createdAt ?? now : now,
    updatedAt: now,
    provider: config.provider,
    model: config.model,
    cwd: config.cwd,
    messages: persistMessages,
    tokenUsage,
  };

  const filePath = join(dir, `${id}.json`);
  writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');

  return session;
}

export function loadSession(id: string): SavedSession | null {
  const dir = getSessionsDir();
  const filePath = join(dir, `${id}.json`);

  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as SavedSession;
  } catch {
    return null;
  }
}

export interface SessionSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  provider: string;
  model: string;
  messageCount: number;
  preview: string; // first user message preview
}

export function listSessions(limit = 20): SessionSummary[] {
  const dir = getSessionsDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse(); // newest first

  const summaries: SessionSummary[] = [];

  for (const file of files.slice(0, limit)) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const session = JSON.parse(raw) as SavedSession;
      const firstUserMsg = session.messages.find((m) => m.role === 'user');
      const preview = firstUserMsg
        ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '')
        : '(empty)';

      summaries.push({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        provider: session.provider,
        model: session.model,
        messageCount: session.messages.length,
        preview,
      });
    } catch {
      // Skip malformed session files
    }
  }

  return summaries;
}

export function getLatestSessionId(): string | null {
  const sessions = listSessions(1);
  return sessions.length > 0 ? sessions[0].id : null;
}
