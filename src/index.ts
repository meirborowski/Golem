import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Agent } from "#core/agent.js";
import { resolveConfig, displayModel } from "#core/config.js";
import { createModel } from "#core/createModel.js";
import { PipelineEngine } from "#pipeline/engine.js";
import { InkAdapter } from "#adapters/ui/ink/InkAdapter.js";
import { LocalFileSystemAdapter } from "#adapters/fs/LocalFileSystemAdapter.js";
import { LocalExecutionEnvironment } from "#adapters/exec/LocalExecutionEnvironment.js";
import { ContextGatheringStep } from "#pipeline/steps/ContextGatheringStep.js";
import { ContextCompactionStep } from "#pipeline/steps/ContextCompactionStep.js";
import { HumanApprovalStep } from "#pipeline/steps/HumanApprovalStep.js";
import { FileDebugLogger } from "#adapters/debug/FileDebugLogger.js";
import { NullDebugLogger } from "#adapters/debug/NullDebugLogger.js";
import { DebugLoggingStep } from "#adapters/debug/DebugLoggingStep.js";
import { wrapToolsWithLogging } from "#adapters/debug/wrapToolsWithLogging.js";

async function main() {
  const config = resolveConfig();

  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf-8"));

  const debugEnabled = process.env.GOLEM_DEBUG === "1"
    || process.argv.includes("--debug");

  const debugLogger = debugEnabled
    ? new FileDebugLogger(join(process.cwd(), ".golem-debug.jsonl"))
    : new NullDebugLogger();

  const model = createModel(config);
  const ui = new InkAdapter({
    modelName: displayModel(config),
    workingDirectory: process.cwd(),
    version: pkg.version,
  });
  const fs = new LocalFileSystemAdapter(process.cwd());
  const exec = new LocalExecutionEnvironment();

  const prePipeline = new PipelineEngine(debugLogger);
  if (debugLogger.isEnabled()) {
    prePipeline.register(new DebugLoggingStep("pre-pipeline", debugLogger));
  }
  prePipeline.register(new ContextGatheringStep(fs, model, ui));
  prePipeline.register(new ContextCompactionStep(model, ui, {
    maxContextTokens: config.maxContextTokens,
    compactionThreshold: 0.75,
    targetAfterCompaction: 0.50,
    protectedTurnCount: 4,
  }));

  const postPipeline = new PipelineEngine(debugLogger);
  if (debugLogger.isEnabled()) {
    postPipeline.register(new DebugLoggingStep("post-pipeline", debugLogger));
  }
  postPipeline.register(new HumanApprovalStep(ui));

  const agent = new Agent({
    model,
    fs,
    ui,
    exec,
    prePipeline,
    postPipeline,
    workingDirectory: process.cwd(),
    wrapTools: debugLogger.isEnabled()
      ? (tools) => wrapToolsWithLogging(tools, debugLogger)
      : undefined,
  });

  await agent.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
