import { z } from "zod";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// --- Types ---

export interface EvalCase {
  id: string;
  name: string;
  description: string;
  category: "file-editing" | "code-generation" | "codebase-qa";
  tags?: string[];
  task: string;
  initialFiles: Record<string, string>;
  mockCommandResponses?: Array<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
  mockLlmResponse?: MockLlmScript;
  expectations: EvalExpectation[];
  agentConfig?: {
    maxSteps?: number;
    systemPrompt?: string;
  };
}

export interface MockLlmScript {
  turns: MockLlmTurn[];
}

export interface MockLlmTurn {
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
  }>;
  text?: string;
}

export type ExpectationType =
  | "file-exact-match"
  | "file-contains"
  | "file-not-contains"
  | "file-exists"
  | "file-not-exists"
  | "response-contains"
  | "response-not-contains"
  | "llm-judge";

export interface EvalExpectation {
  type: ExpectationType;
  filePath?: string;
  expected?: string;
  rubric?: string;
  weight?: number;
}

export interface EvalExpectationResult {
  expectation: EvalExpectation;
  passed: boolean;
  score: number;
  message: string;
}

export interface EvalCaseResult {
  caseId: string;
  caseName: string;
  category: string;
  mode: "mock" | "real";
  passed: boolean;
  score: number;
  expectationResults: EvalExpectationResult[];
  durationMs: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  error?: string;
  runTimestamp: string;
}

export interface EvalReport {
  runId: string;
  timestamp: string;
  mode: "mock" | "real";
  modelId?: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  totalDurationMs: number;
  results: EvalCaseResult[];
}

// --- Zod Schemas ---

const EvalExpectationSchema = z.object({
  type: z.enum([
    "file-exact-match",
    "file-contains",
    "file-not-contains",
    "file-exists",
    "file-not-exists",
    "response-contains",
    "response-not-contains",
    "llm-judge",
  ]),
  filePath: z.string().optional(),
  expected: z.string().optional(),
  rubric: z.string().optional(),
  weight: z.number().default(1.0),
});

const MockLlmTurnSchema = z.object({
  toolCalls: z
    .array(
      z.object({
        toolName: z.string(),
        args: z.record(z.unknown()),
      }),
    )
    .optional(),
  text: z.string().optional(),
});

const EvalCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(["file-editing", "code-generation", "codebase-qa"]),
  tags: z.array(z.string()).optional(),
  task: z.string(),
  initialFiles: z.record(z.string()),
  mockCommandResponses: z
    .array(
      z.object({
        stdout: z.string(),
        stderr: z.string(),
        exitCode: z.number(),
      }),
    )
    .optional(),
  mockLlmResponse: z
    .object({
      turns: z.array(MockLlmTurnSchema),
    })
    .optional(),
  expectations: z.array(EvalExpectationSchema),
  agentConfig: z
    .object({
      maxSteps: z.number().optional(),
      systemPrompt: z.string().optional(),
    })
    .optional(),
});

// --- Case Loading ---

function findJsonFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (entry.endsWith(".json")) {
      results.push(fullPath);
    }
  }
  return results;
}

export function loadEvalCases(casesDir?: string): EvalCase[] {
  const dir = casesDir ?? join(import.meta.dirname, "..", "cases");
  const files = findJsonFiles(dir);
  const cases: EvalCase[] = [];

  for (const file of files) {
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    const parsed = EvalCaseSchema.parse(raw);
    cases.push(parsed as EvalCase);
  }

  return cases;
}
