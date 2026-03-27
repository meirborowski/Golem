import chalk from "chalk";
import { theme } from "../theme.js";

/**
 * Apply lightweight inline formatting for streaming output.
 * Only handles bold and inline code — full markdown is rendered
 * in the final Static assistant message after streaming ends.
 */
export function applyLightFormatting(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, (_, text) => chalk.bold(text))
    .replace(/`([^`]+)`/g, (_, text) => chalk.hex(theme.accent)(text));
}
