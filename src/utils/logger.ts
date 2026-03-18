import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

let debugEnabled = false;
let logFilePath: string | null = null;

export function initLogger(debug: boolean): void {
  debugEnabled = debug;
  if (debug) {
    const logDir = join(homedir(), '.config', 'golem');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    logFilePath = join(logDir, 'debug.log');
  }
}

function write(level: string, message: string, data?: unknown): void {
  if (!debugEnabled || !logFilePath) return;

  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [${level}] ${message}`;
  if (data !== undefined) {
    line += ` ${JSON.stringify(data)}`;
  }
  line += '\n';

  try {
    appendFileSync(logFilePath, line, 'utf-8');
  } catch {
    // Silently fail — never interrupt the UI
  }
}

export const logger = {
  debug: (msg: string, data?: unknown) => write('DEBUG', msg, data),
  info: (msg: string, data?: unknown) => write('INFO', msg, data),
  warn: (msg: string, data?: unknown) => write('WARN', msg, data),
  error: (msg: string, data?: unknown) => write('ERROR', msg, data),
};
