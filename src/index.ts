import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
import { PlanningStep } from "#pipeline/steps/PlanningStep.js";
import { FileDebugLogger } from "#adapters/debug/FileDebugLogger.js";
import { NullDebugLogger } from "#adapters/debug/NullDebugLogger.js";
import { DebugLoggingStep } from "#adapters/debug/DebugLoggingStep.js";
import { wrapToolsWithLogging } from "#adapters/debug/wrapToolsWithLogging.js";
import { FileAgentRegistry } from "#adapters/agents/FileAgentRegistry.js";
import type { IPipelineStep } from "#core/interfaces/IPipelineStep.js";

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

  // Pipeline steps (registered by name for agent overrides)
  const contextGathering = new ContextGatheringStep(fs, model, ui);
  const contextCompaction = new ContextCompactionStep(model, ui, {
    maxContextTokens: config.maxContextTokens,
    compactionThreshold: 0.75,
    targetAfterCompaction: 0.50,
    protectedTurnCount: 4,
  });
  const humanApproval = new HumanApprovalStep(ui);

  // Agent registry: built-in agents + project-local agents
  const selfDir = dirname(fileURLToPath(import.meta.url));
  const builtInAgentsDir = join(selfDir, "agents");
  const projectAgentsDir = join(process.cwd(), "agents");

  const agentRegistry = new FileAgentRegistry(builtInAgentsDir, projectAgentsDir);
  await agentRegistry.loadAll();

  const planning = new PlanningStep(agentRegistry, ui);

  const pipelineStepRegistry = new Map<string, IPipelineStep>();
  pipelineStepRegistry.set("ContextGathering", contextGathering);
  pipelineStepRegistry.set("Planning", planning);
  pipelineStepRegistry.set("ContextCompaction", contextCompaction);
  pipelineStepRegistry.set("HumanApproval", humanApproval);

  const prePipeline = new PipelineEngine(debugLogger);
  if (debugLogger.isEnabled()) {
    prePipeline.register(new DebugLoggingStep("pre-pipeline", debugLogger));
  }
  prePipeline.register(contextGathering);
  prePipeline.register(planning);
  prePipeline.register(contextCompaction);

  const postPipeline = new PipelineEngine(debugLogger);
  if (debugLogger.isEnabled()) {
    postPipeline.register(new DebugLoggingStep("post-pipeline", debugLogger));
  }
  postPipeline.register(humanApproval);

  const agent = new Agent({
    model,
    provider: config.provider,
    modelName: config.model,
    fs,
    ui,
    exec,
    prePipeline,
    postPipeline,
    workingDirectory: process.cwd(),
    wrapTools: debugLogger.isEnabled()
      ? (tools) => wrapToolsWithLogging(tools, debugLogger)
      : undefined,
    agentRegistry,
    pipelineStepRegistry,
    createModelFromOverride: (provider, modelName) => {
      return createModel({ provider: provider as "openai" | "anthropic" | "google" | "ollama", model: modelName, maxContextTokens: config.maxContextTokens });
    },
  });

  planning.setRunner(agent);

  await agent.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
