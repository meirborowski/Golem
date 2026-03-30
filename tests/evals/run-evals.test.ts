import { describe, it, expect, afterAll } from "vitest";
import { loadEvalCases } from "./runner/EvalCase.js";
import { EvalRunner } from "./runner/EvalRunner.js";
import { printReport } from "./reporters/ConsoleReporter.js";
import { writeJsonReport } from "./reporters/JsonReporter.js";
import type { EvalCaseResult, EvalReport } from "./runner/EvalCase.js";

const mode = (process.env.GOLEM_EVAL_MODE as "mock" | "real") ?? "mock";
const cases = loadEvalCases();
const runner = new EvalRunner({ mode });
const results: EvalCaseResult[] = [];

describe(`Golem Evals (${mode})`, () => {
  for (const evalCase of cases) {
    it(`[${evalCase.category}] ${evalCase.name}`, async () => {
      const result = await runner.runCase(evalCase);
      results.push(result);
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0.8);
    });
  }

  afterAll(() => {
    if (results.length === 0) return;

    const passed = results.filter((r) => r.passed).length;
    const avgScore =
      results.reduce((sum, r) => sum + r.score, 0) / results.length;

    const report: EvalReport = {
      runId: `eval-${Date.now()}`,
      timestamp: new Date().toISOString(),
      mode,
      totalCases: results.length,
      passedCases: passed,
      failedCases: results.length - passed,
      averageScore: avgScore,
      totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
      results,
    };

    printReport(report);
    const path = writeJsonReport(report);
    console.log(`  JSON report: ${path}`);
  });
});
