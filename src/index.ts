import { readFile } from "node:fs/promises";
import { openai } from "@ai-sdk/openai";
import { Agent } from "./core/agent.js";
import { PipelineEngine } from "./pipeline/engine.js";
import { InkAdapter } from "./adapters/ui/ink/InkAdapter.js";
import { LocalFileSystemAdapter } from "./adapters/fs/LocalFileSystemAdapter.js";
import { LocalExecutionEnvironment } from "./adapters/exec/LocalExecutionEnvironment.js";
import { ContextGatheringStep } from "./pipeline/steps/ContextGatheringStep.js";
import { HumanApprovalStep } from "./pipeline/steps/HumanApprovalStep.js";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY environment variable is required.");
    process.exit(1);
  }

  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf-8"));

  const model = openai("gpt-4o");
  const ui = new InkAdapter({
    modelName: "gpt-5.4-mini",
    workingDirectory: process.cwd(),
    version: pkg.version,
  });
  const fs = new LocalFileSystemAdapter(process.cwd());
  const exec = new LocalExecutionEnvironment();

  const prePipeline = new PipelineEngine();
  prePipeline.register(new ContextGatheringStep(fs, model, ui));

  const postPipeline = new PipelineEngine();
  postPipeline.register(new HumanApprovalStep(ui));

  const agent = new Agent({
    model,
    fs,
    ui,
    exec,
    prePipeline,
    postPipeline,
    workingDirectory: process.cwd(),
  });

  await agent.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
