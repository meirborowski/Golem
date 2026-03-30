import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { EvalReport } from "../runner/EvalCase.js";

export function writeJsonReport(report: EvalReport, outputDir?: string): string {
  const dir = outputDir ?? join(import.meta.dirname, "..", "results");
  mkdirSync(dir, { recursive: true });

  const timestamp = report.timestamp.replace(/[:.]/g, "-");
  const filename = `${timestamp}-${report.mode}.json`;
  const filepath = join(dir, filename);

  writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8");
  return filepath;
}
