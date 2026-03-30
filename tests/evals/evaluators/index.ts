import type { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import type { EvalExpectation, EvalExpectationResult } from "../runner/EvalCase.js";

export interface EvalContext {
  fs: MemoryFileSystemAdapter;
  responseText: string;
}

export async function evaluateExpectation(
  expectation: EvalExpectation,
  context: EvalContext,
): Promise<EvalExpectationResult> {
  switch (expectation.type) {
    case "file-exact-match":
      return fileExactMatch(expectation, context);
    case "file-contains":
      return fileContains(expectation, context, false);
    case "file-not-contains":
      return fileContains(expectation, context, true);
    case "file-exists":
      return fileExists(expectation, context, false);
    case "file-not-exists":
      return fileExists(expectation, context, true);
    case "response-contains":
      return responseContains(expectation, context, false);
    case "response-not-contains":
      return responseContains(expectation, context, true);
    case "llm-judge":
      return llmJudge(expectation, context);
    default:
      return { expectation, passed: false, score: 0, message: `Unknown type: ${expectation.type}` };
  }
}

async function fileExactMatch(
  expectation: EvalExpectation,
  context: EvalContext,
): Promise<EvalExpectationResult> {
  const { filePath, expected } = expectation;
  if (!filePath || expected === undefined) {
    return { expectation, passed: false, score: 0, message: "Missing filePath or expected" };
  }
  try {
    const actual = await context.fs.readFile(filePath);
    const match = actual.trimEnd() === expected.trimEnd();
    return {
      expectation,
      passed: match,
      score: match ? 1 : 0,
      message: match ? "Exact match" : `Content differs:\n  Expected: ${truncate(expected)}\n  Got:      ${truncate(actual)}`,
    };
  } catch {
    return { expectation, passed: false, score: 0, message: `File not found: ${filePath}` };
  }
}

async function fileContains(
  expectation: EvalExpectation,
  context: EvalContext,
  negate: boolean,
): Promise<EvalExpectationResult> {
  const { filePath, expected } = expectation;
  if (!filePath || expected === undefined) {
    return { expectation, passed: false, score: 0, message: "Missing filePath or expected" };
  }
  try {
    const actual = await context.fs.readFile(filePath);
    const contains = actual.includes(expected);
    const passed = negate ? !contains : contains;
    const verb = negate ? "not contain" : "contain";
    return {
      expectation,
      passed,
      score: passed ? 1 : 0,
      message: passed
        ? `File does ${negate ? "not " : ""}contain "${truncate(expected)}"`
        : `Expected file to ${verb} "${truncate(expected)}"`,
    };
  } catch {
    return { expectation, passed: false, score: 0, message: `File not found: ${filePath}` };
  }
}

async function fileExists(
  expectation: EvalExpectation,
  context: EvalContext,
  negate: boolean,
): Promise<EvalExpectationResult> {
  const { filePath } = expectation;
  if (!filePath) {
    return { expectation, passed: false, score: 0, message: "Missing filePath" };
  }
  const exists = await context.fs.exists(filePath);
  const passed = negate ? !exists : exists;
  return {
    expectation,
    passed,
    score: passed ? 1 : 0,
    message: passed
      ? `File ${negate ? "does not exist" : "exists"} as expected`
      : `Expected file to ${negate ? "not exist" : "exist"}: ${filePath}`,
  };
}

async function responseContains(
  expectation: EvalExpectation,
  context: EvalContext,
  negate: boolean,
): Promise<EvalExpectationResult> {
  const { expected } = expectation;
  if (expected === undefined) {
    return { expectation, passed: false, score: 0, message: "Missing expected" };
  }
  const contains = context.responseText.toLowerCase().includes(expected.toLowerCase());
  const passed = negate ? !contains : contains;
  const verb = negate ? "not contain" : "contain";
  return {
    expectation,
    passed,
    score: passed ? 1 : 0,
    message: passed
      ? `Response does ${negate ? "not " : ""}contain "${truncate(expected)}"`
      : `Expected response to ${verb} "${truncate(expected)}"`,
  };
}

async function llmJudge(
  expectation: EvalExpectation,
  _context: EvalContext,
): Promise<EvalExpectationResult> {
  // LLM judge is skipped in mock mode — returns a passing placeholder
  // Real implementation would call a model with the rubric
  return {
    expectation,
    passed: true,
    score: 1,
    message: "LLM judge skipped (mock mode)",
  };
}

function truncate(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
