import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from './logger.js';

let managedContainerId: string | null = null;
let settingsTmpDir: string | null = null;

/**
 * SearXNG settings that disable bot detection / rate limiting
 * so local API calls aren't blocked with 403.
 */
const SEARXNG_SETTINGS = `\
use_default_settings: true

server:
  limiter: false
  public_instance: false
  secret_key: golem-local-instance

search:
  formats:
    - html
    - json
`;

/**
 * Extract the port number from a base URL. Defaults to 8080.
 */
function extractPort(baseUrl: string): number {
  try {
    const url = new URL(baseUrl);
    return url.port ? Number(url.port) : 8080;
  } catch {
    return 8080;
  }
}

/**
 * Check if a SearXNG instance is reachable at the given URL.
 */
async function isReachable(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${baseUrl}/search?q=test&format=json`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for SearXNG to become healthy, polling every second.
 */
async function waitForHealthy(baseUrl: string, maxWaitMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isReachable(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

/**
 * Ensure a SearXNG instance is running. If one is already reachable at the
 * given URL, use it. Otherwise, start a Docker container.
 *
 * Returns the container ID if one was started, or null if an existing
 * instance was found or Docker failed.
 */
export async function ensureSearxng(baseUrl: string): Promise<{ url: string; containerId: string | null }> {
  // Check if already running
  if (await isReachable(baseUrl)) {
    logger.info('SearXNG already reachable', { baseUrl });
    return { url: baseUrl, containerId: null };
  }

  const port = extractPort(baseUrl);

  try {
    // Start container (no --rm because we need docker restart later)
    const containerId = execSync(
      `docker run -d -p ${port}:8080 searxng/searxng`,
      { encoding: 'utf-8', timeout: 60_000 },
    ).trim();

    logger.info('Started SearXNG container', { containerId, port });
    managedContainerId = containerId;

    // Wait for initial boot so the settings file exists
    await waitForHealthy(baseUrl, 15_000);

    // Copy custom settings that disable the limiter, then restart
    settingsTmpDir = join(tmpdir(), `golem-searxng-${Date.now()}`);
    mkdirSync(settingsTmpDir, { recursive: true });
    const settingsPath = join(settingsTmpDir, 'settings.yml');
    writeFileSync(settingsPath, SEARXNG_SETTINGS, 'utf-8');

    execSync(`docker cp "${settingsPath}" ${containerId}:/etc/searxng/settings.yml`, {
      encoding: 'utf-8',
      timeout: 10_000,
    });

    execSync(`docker restart ${containerId}`, {
      encoding: 'utf-8',
      timeout: 30_000,
    });

    const healthy = await waitForHealthy(baseUrl, 15_000);
    if (!healthy) {
      logger.warn('SearXNG container not healthy after restart');
    }

    return { url: baseUrl, containerId };
  } catch (error) {
    logger.warn('Failed to start SearXNG container (Docker may not be installed)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { url: baseUrl, containerId: null };
  }
}

/**
 * Stop and remove a SearXNG container by ID.
 */
export function stopSearxng(containerId: string): void {
  try {
    execSync(`docker stop ${containerId}`, { encoding: 'utf-8', timeout: 10_000 });
    logger.info('Stopped SearXNG container', { containerId });
  } catch {
    // Container may already be gone
  }
  try {
    execSync(`docker rm ${containerId}`, { encoding: 'utf-8', timeout: 10_000 });
  } catch {
    // Already removed
  }
}

/**
 * Clean up the managed SearXNG container, if one was started.
 * Safe to call multiple times.
 */
export function cleanupSearxng(): void {
  if (managedContainerId) {
    stopSearxng(managedContainerId);
    managedContainerId = null;
  }
  if (settingsTmpDir) {
    try {
      rmSync(settingsTmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
    settingsTmpDir = null;
  }
}
