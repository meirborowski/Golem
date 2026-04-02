import type { LanguageModel } from "ai";
import { Agent } from "#core/agent.js";
import { PipelineEngine } from "#pipeline/engine.js";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { MockUserInterface } from "../../mocks/MockUserInterface.js";
import { MockExecutionEnvironment } from "../../mocks/MockExecutionEnvironment.js";
import { createMockModelFromScript } from "./mockModel.js";
import { evaluateExpectation } from "../evaluators/index.js";
import type {
  EvalCase,
  EvalCaseResult,
  EvalExpectationResult,
  EvalReport,
} from "./EvalCase.js";

export interface EvalRunnerConfig {
  mode: "mock" | "real";
  model?: LanguageModel;
  modelId?: string;
  runs?: number;
}

export class EvalRunner {
  private config: EvalRunnerConfig;

  constructor(config: EvalRunnerConfig) {
    this.config = config;
  }

  async runCase(evalCase: EvalCase): Promise<EvalCaseResult> {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    try {
      const fs = new MemoryFileSystemAdapter(evalCase.initialFiles);
      const ui = new MockUserInterface([evalCase.task, "exit"], true);
      const exec = new MockExecutionEnvironment(evalCase.mockCommandResponses);

      let model: LanguageModel;
      if (this.config.mode === "mock") {
        if (!evalCase.mockLlmResponse) {
          return {
            caseId: evalCase.id,
            caseName: evalCase.name,
            category: evalCase.category,
            mode: "mock",
            passed: false,
            score: 0,
            expectationResults: [],
            durationMs: Date.now() - start,
            error: "No mockLlmResponse defined for mock mode",
            runTimestamp: timestamp,
          };
        }
        model = createMockModelFromScript(evalCase.mockLlmResponse);
      } else {
        if (!this.config.model) {
          throw new Error("Real mode requires a model in EvalRunnerConfig");
        }
        model = this.config.model;
      }

      const agent = new Agent({
        model,
        provider: "openai",
        modelName: this.config.modelId ?? "gpt-4o",
        fs,
        ui,
        exec,
        prePipeline: new PipelineEngine(),
        postPipeline: new PipelineEngine(),
        workingDirectory: "/project",
        maxSteps: evalCase.agentConfig?.maxSteps ?? 10,
        systemPrompt: evalCase.agentConfig?.systemPrompt,
      });

      await agent.run();

      const responseText = ui.streamedChunks
        .filter((c) => c !== "[END]")
        .join("");

      const expectationResults: EvalExpectationResult[] = [];
      for (const exp of evalCase.expectations) {
        const result = await evaluateExpectation(exp, { fs, responseText });
        expectationResults.push(result);
      }

      const totalWeight = expectationResults.reduce(
        (sum, r) => sum + (r.expectation.weight ?? 1),
        0,
      );
      const weightedScore =
        totalWeight > 0
          ? expectationResults.reduce(
              (sum, r) => sum + r.score * (r.expectation.weight ?? 1),
              0,
            ) / totalWeight
          : 0;

      const allPassed = expectationResults.every((r) => r.passed);

      return {
        caseId: evalCase.id,
        caseName: evalCase.name,
        category: evalCase.category,
        mode: this.config.mode,
        passed: allPassed,
        score: weightedScore,
        expectationResults,
        durationMs: Date.now() - start,
        runTimestamp: timestamp,
      };
    } catch (e) {
      return {
        caseId: evalCase.id,
        caseName: evalCase.name,
        category: evalCase.category,
        mode: this.config.mode,
        passed: false,
        score: 0,
        expectationResults: [],
        durationMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
        runTimestamp: timestamp,
      };
    }
  }

  async runAll(cases: EvalCase[]): Promise<EvalReport> {
    const start = Date.now();
    const results: EvalCaseResult[] = [];

    if (this.config.mode === "real" && (this.config.runs ?? 1) > 1) {
      for (const evalCase of cases) {
        const runResults: EvalCaseResult[] = [];
        for (let i = 0; i < (this.config.runs ?? 1); i++) {
          runResults.push(await this.runCase(evalCase));
        }
        // Use median score run
        runResults.sort((a, b) => a.score - b.score);
        const median = runResults[Math.floor(runResults.length / 2)];
        results.push(median);
      }
    } else {
      for (const evalCase of cases) {
        results.push(await this.runCase(evalCase));
      }
    }

    const passed = results.filter((r) => r.passed).length;
    const avgScore =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;

    return {
      runId: `eval-${Date.now()}`,
      timestamp: new Date().toISOString(),
      mode: this.config.mode,
      modelId: this.config.modelId,
      totalCases: results.length,
      passedCases: passed,
      failedCases: results.length - passed,
      averageScore: avgScore,
      totalDurationMs: Date.now() - start,
      results,
    };
  }
}
