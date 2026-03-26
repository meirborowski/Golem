import type { IDebugLogger } from "#core/interfaces/IDebugLogger.js";

export class NullDebugLogger implements IDebugLogger {
  isEnabled(): boolean {
    return false;
  }

  log(): void {
    // intentional no-op
  }
}
