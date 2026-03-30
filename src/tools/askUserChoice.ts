import { tool } from "ai";
import { z } from "zod";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";

export function createAskUserChoiceTool(ui: IUserInterface) {
  return tool({
    description:
      "Present the user with a list of options and wait for them to choose one. " +
      "Use this when you have a specific set of alternatives for the user to pick from. " +
      "For open-ended questions, use askUser instead.",
    inputSchema: z.object({
      question: z.string().min(1).describe("The question to ask the user"),
      options: z
        .array(z.string())
        .min(2)
        .describe("The list of options to choose from"),
    }),
    execute: async ({ question, options }) => {
      const displayMessage =
        question +
        "\n" +
        options.map((opt, i) => `  ${i + 1}. ${opt}`).join("\n") +
        "\nChoose a number or type your answer";

      const response = await ui.prompt(displayMessage + "\n> ");

      if (!response || response.trim() === "") {
        return "[The user provided an empty response]";
      }

      const num = parseInt(response.trim(), 10);
      if (num >= 1 && num <= options.length) {
        return options[num - 1];
      }

      return response.trim();
    },
  });
}
