import { tool } from "ai";
import { z } from "zod";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";

export function createAskUserTool(ui: IUserInterface) {
  return tool({
    description:
      "Ask the user an open-ended question and wait for their free-text response. " +
      "Use this when you need more information to proceed, when the task is ambiguous, " +
      "or when you want to confirm an approach before taking action. " +
      "For multiple-choice questions, use askUserChoice instead.",
    inputSchema: z.object({
      question: z
        .string()
        .min(1)
        .describe("The question to ask the user"),
    }),
    execute: async ({ question }) => {
      const response = await ui.prompt(question + "\n> ");

      if (!response || response.trim() === "") {
        return "[The user provided an empty response]";
      }

      return response.trim();
    },
  });
}
