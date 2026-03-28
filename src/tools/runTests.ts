import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";

const MAX_OUTPUT_LENGTH = 10000;

type Framework = "vitest" | "jest" | "npm" | "pytest" | "go";

interface DetectedFramework {
  name: Framework;
  command: string;
}

export function createRunTestsTool(exec: IExecutionEnvironment, fs: IFileSystem, cwd?: string) {
  return tool({
    description:
      "Run tests with automatic framework detection. Detects vitest, jest, pytest, and go test from project config. Returns a structured summary with pass/fail counts. Use 'command' to override auto-detection.",
    inputSchema: z.object({
      path: z.string().optional().describe("Specific test file or directory to run"),
      pattern: z.string().optional().describe("Test name pattern to filter (e.g. 'auth' to run only auth-related tests)"),
      command: z.string().optional().describe("Override auto-detection with a custom test command"),
    }),
    execute: async ({ path, pattern, command }) => {
      try {
        let testCommand: string;
        let framework: string;

        if (command) {
          testCommand = command;
          framework = "custom";
        } else {
          const detected = await detectFramework(fs, cwd);
          if (!detected) {
            return "Error: Could not detect test framework. No package.json scripts.test, pytest.ini, pyproject.toml, or go.mod found. Use the 'command' parameter to specify a test command.";
          }
          framework = detected.name;
          testCommand = buildCommand(detected, path, pattern);
        }

        const result = await exec.execute(testCommand, cwd);
        const fullOutput = (result.stdout + "\n" + result.stderr).trim();
        const summary = parseSummary(fullOutput, result.exitCode);

        let output = `Framework: ${framework}\n`;
        output += `Command: ${testCommand}\n`;
        output += `Status: ${result.exitCode === 0 ? "PASSED" : "FAILED"}\n`;
        if (summary) output += `Summary: ${summary}\n`;
        output += `\n--- Output ---\n`;

        if (fullOutput.length > MAX_OUTPUT_LENGTH) {
          output += fullOutput.slice(fullOutput.length - MAX_OUTPUT_LENGTH) + `\n\n... showing last ${MAX_OUTPUT_LENGTH} chars of ${fullOutput.length} total`;
        } else {
          output += fullOutput;
        }

        return output;
      } catch (e) {
        return `Error running tests: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}

async function detectFramework(fs: IFileSystem, cwd?: string): Promise<DetectedFramework | null> {
  const base = cwd ?? ".";

  // Check package.json first
  try {
    const pkgContent = await fs.readFile(`${base}/package.json`);
    const pkg = JSON.parse(pkgContent);
    const testScript: string = pkg?.scripts?.test ?? "";

    if (testScript.includes("vitest")) {
      return { name: "vitest", command: "npx vitest run" };
    }
    if (testScript.includes("jest")) {
      return { name: "jest", command: "npx jest" };
    }
    if (testScript) {
      return { name: "npm", command: "npm test --" };
    }
  } catch {
    // No package.json, try other frameworks
  }

  // Check for pytest
  for (const file of ["pytest.ini", "pyproject.toml", "setup.cfg"]) {
    if (await fs.exists(`${base}/${file}`)) {
      try {
        const content = await fs.readFile(`${base}/${file}`);
        if (file === "pyproject.toml" && !content.includes("[tool.pytest")) continue;
        if (file === "setup.cfg" && !content.includes("[tool:pytest]")) continue;
        return { name: "pytest", command: "pytest" };
      } catch {
        continue;
      }
    }
  }

  // Check for Go
  if (await fs.exists(`${base}/go.mod`)) {
    return { name: "go", command: "go test ./..." };
  }

  return null;
}

function buildCommand(framework: DetectedFramework, path?: string, pattern?: string): string {
  let cmd = framework.command;

  switch (framework.name) {
    case "vitest":
      if (path) cmd += ` ${path}`;
      if (pattern) cmd += ` --testNamePattern "${pattern}"`;
      break;
    case "jest":
      if (path) cmd += ` ${path}`;
      if (pattern) cmd += ` --testNamePattern "${pattern}"`;
      break;
    case "npm":
      if (path) cmd += ` ${path}`;
      if (pattern) cmd += ` --testNamePattern "${pattern}"`;
      break;
    case "pytest":
      if (path) cmd += ` ${path}`;
      if (pattern) cmd += ` -k "${pattern}"`;
      break;
    case "go":
      if (path) cmd = `go test ${path}`;
      if (pattern) cmd += ` -run "${pattern}"`;
      break;
  }

  return cmd;
}

function parseSummary(output: string, exitCode: number): string | null {
  // Vitest/Jest: "Tests  X failed | Y passed (Z)"
  const vitestMatch = output.match(/Tests\s+.*?(\d+\s+failed)?.*?(\d+\s+passed).*?\((\d+)\)/);
  if (vitestMatch) {
    return vitestMatch[0].trim();
  }

  // Vitest: "Test Files  X failed | Y passed (Z)"
  const testFilesMatch = output.match(/Test Files\s+.*?(\d+\s+failed)?.*?(\d+\s+passed).*?\((\d+)\)/);
  if (testFilesMatch) {
    return testFilesMatch[0].trim();
  }

  // Pytest: "X passed, Y failed" or "X passed"
  const pytestMatch = output.match(/=+\s+([\d\w\s,]+)\s+in\s+[\d.]+s\s+=+/);
  if (pytestMatch) {
    return pytestMatch[1].trim();
  }

  // Go: "ok" or "FAIL" lines
  const goLines = output.split("\n").filter((l) => l.startsWith("ok") || l.startsWith("FAIL"));
  if (goLines.length > 0) {
    return goLines.join("; ");
  }

  return exitCode === 0 ? "All tests passed" : "Tests failed";
}
