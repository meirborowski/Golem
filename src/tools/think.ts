import { tool } from 'ai';
import { z } from 'zod';

export const think = () =>
  tool({
    description:
      'Use this tool to think through complex problems step-by-step. Write your reasoning, analysis, or planning here. The content is not shown to the user — it is a private scratchpad for working through problems before acting. Use it when you need to break down a complex task, weigh options, or plan a multi-step approach.',
    parameters: z.object({
      thought: z.string().describe('Your step-by-step reasoning, analysis, or planning'),
    }),
    execute: async ({ thought }) => {
      return {
        success: true,
        thought,
      };
    },
  });
