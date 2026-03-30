import type { EvalReport, EvalCaseResult } from "../runner/EvalCase.js";

export function printReport(report: EvalReport): void {
  const line = "\u2500".repeat(65);

  console.log();
  console.log(line);
  console.log(
    `  Golem Eval Results  |  Mode: ${report.mode}  |  ${report.passedCases}/${report.totalCases} passed`,
  );
  console.log(line);

  for (const result of report.results) {
    printCaseResult(result);
  }

  console.log(line);
  console.log(
    `  Average Score: ${report.averageScore.toFixed(2)}  |  Total: ${report.totalDurationMs}ms`,
  );
  console.log(line);
  console.log();
}

function printCaseResult(result: EvalCaseResult): void {
  const status = result.passed ? "PASS" : "FAIL";
  const icon = result.passed ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  const name = result.caseName.padEnd(35);
  const score = result.score.toFixed(2);

  console.log(
    `  ${icon}${status}${reset}  ${name} ${score}  (${result.durationMs}ms)`,
  );

  if (!result.passed) {
    if (result.error) {
      console.log(`        Error: ${result.error}`);
    }
    for (const er of result.expectationResults) {
      if (!er.passed) {
        console.log(`        [${er.expectation.type}] ${er.message}`);
      }
    }
  }
}
