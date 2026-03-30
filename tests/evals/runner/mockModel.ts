import { MockLanguageModelV3 } from "ai/test";
import { simulateReadableStream } from "ai";
import type { MockLlmScript } from "./EvalCase.js";

export function createMockModelFromScript(script: MockLlmScript): MockLanguageModelV3 {
  let turnIndex = 0;

  return new MockLanguageModelV3({
    doStream: () => {
      const turn = script.turns[turnIndex++];
      if (!turn) {
        return buildTextOnlyStream("Done.");
      }
      return buildStreamFromTurn(turn);
    },
  });
}

function buildTextOnlyStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        { type: "text-start" as const, id: "text-1" },
        { type: "text-delta" as const, id: "text-1", delta: text },
        { type: "text-end" as const, id: "text-1" },
        {
          type: "finish" as const,
          usage: { inputTokens: 10, outputTokens: 5 },
          finishReason: "stop" as const,
        },
      ],
      chunkDelayInMs: 0,
    }),
  };
}

function buildStreamFromTurn(turn: { toolCalls?: Array<{ toolName: string; args: Record<string, unknown> }>; text?: string }) {
  const chunks: any[] = [{ type: "stream-start" as const, warnings: [] }];

  if (turn.toolCalls) {
    for (const tc of turn.toolCalls) {
      chunks.push({
        type: "tool-call" as const,
        id: `call-${tc.toolName}`,
        toolName: tc.toolName,
        input: JSON.stringify(tc.args),
      });
    }
  }

  if (turn.text) {
    chunks.push(
      { type: "text-start" as const, id: "text-1" },
      { type: "text-delta" as const, id: "text-1", delta: turn.text },
      { type: "text-end" as const, id: "text-1" },
    );
  }

  const finishReason = turn.toolCalls && !turn.text ? "tool-calls" : "stop";
  chunks.push({
    type: "finish" as const,
    usage: { inputTokens: 50, outputTokens: 20 },
    finishReason: finishReason as "stop" | "tool-calls",
  });

  return {
    stream: simulateReadableStream({ chunks, chunkDelayInMs: 0 }),
  };
}
