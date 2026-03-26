import type { LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { ollama } from "ollama-ai-provider";
import type { GolemConfig } from "./config.js";

/**
 * Create an AI SDK LanguageModel from the resolved config.
 * Provider SDKs are tree-shakeable — unused providers add no runtime cost
 * in bundled builds.
 */
export function createModel(config: GolemConfig): LanguageModel {
  switch (config.provider) {
    case "openai":
      return openai(config.model);
    case "anthropic":
      return anthropic(config.model);
    case "google":
      // @ai-sdk/google exports V1 types; AI SDK handles V1 at runtime
      return google(config.model) as unknown as LanguageModel;
    case "ollama":
      // ollama-ai-provider exports V1 types; AI SDK handles V1 at runtime
      return ollama(config.model) as unknown as LanguageModel;
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
