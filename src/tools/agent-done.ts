import { tool } from 'ai';
import { z } from 'zod';

export const agentDone = () =>
  tool({
    description:
      'Call this tool when you have fully completed the assigned task and have nothing left to do. Provide a brief summary of what was accomplished.',
    inputSchema: z.object({
      summary: z.string().describe('Brief summary of what was accomplished'),
      filesChanged: z
        .union([z.array(z.string()), z.null()])
        .describe('Optional list of files that were created or modified'),
    }),
    execute: async ({ summary, filesChanged }) => {
      return {
        success: true,
        done: true,
        summary,
        filesChanged: filesChanged ?? [],
      };
    },
  });
