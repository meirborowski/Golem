import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";

const MAX_OUTPUT_LENGTH = 10000;

type DiagnosticTool = "tsc" | "eslint" | "biome" | "pyright" | "ruff" | "golangci-lint";

interface DetectedTool {
  name: DiagnosticTool;
  command: string;
}

export function createDiagnosticsTool(exec: IExecutionEnvironment, fs: IFileSystem, cwd?: string) {
  return tool({
    description:
      "Run type-checkers and linters to find errors and warnings. Auto-detects tsc, eslint, biome, pyright, ruff, and golangci-lint from project config. " +
      "Use after writing code to catch type errors and lint issues before presenting changes. Use 'command' to override auto-detection.",
    inputSchema: z.object({
      path: z.string().optional().describe("Specific file or directory to check (default: whole project)"),
      tool: z.enum(["tsc", "eslint", "biome", "pyright", "ruff", "golangci-lint", "auto"])
        .optional()
        .describe("Which diagnostic tool to run (default: auto-detect)"),
      command: z.string().optional().describe("Override auto-detection with a custom diagnostic command"),
      fix: z.boolean().optional().describe("Apply auto-fixes where supported (eslint, biome, ruff)"),
    }),
    execute: async ({ path, tool: toolChoice, command, fix }) => {
      try {
        if (command) {
          return await runDiagnostic("custom", command, exec, cwd);
        }

        const choice = toolChoice ?? "auto";

        if (choice !== "auto") {
          const cmd = buildCommand(choice, path, fix);
          return await runDiagnostic(choice, cmd, exec, cwd);
        }

        // Auto-detect available tools
        const detected = await detectTools(fs, cwd);
        if (detected.length === 0) {
          return "Error: No diagnostic tools detected. No tsconfig.json, .eslintrc*, biome.json, pyrightconfig.json, pyproject.toml, or .golangci.yml found. Use the 'command' parameter to specify a diagnostic command.";
        }

        // Run all detected tools and combine results
        const results: string[] = [];
        for (const dt of detected) {
          const cmd = buildCommand(dt.name, path, fix);
          const output = await runDiagnostic(dt.name, cmd, exec, cwd);
          results.push(output);
        }

        return results.join("\n\n" + "=".repeat(60) + "\n\n");
      } catch (e) {
        return `Error running diagnostics: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}

async function runDiagnostic(
  name: string,
  command: string,
  exec: IExecutionEnvironment,
  cwd?: string,
): Promise<string> {
  const result = await exec.execute(command, cwd);
  const fullOutput = (result.stdout + "\n" + result.stderr).trim();
  const summary = parseSummary(name, fullOutput, result.exitCode);

  let output = `Tool: ${name}\n`;
  output += `Command: ${command}\n`;
  output += `Status: ${result.exitCode === 0 ? "CLEAN" : "ISSUES FOUND"}\n`;
  if (summary) output += `Summary: ${summary}\n`;
  output += `\n--- Output ---\n`;

  if (fullOutput.length > MAX_OUTPUT_LENGTH) {
    output += fullOutput.slice(0, MAX_OUTPUT_LENGTH) + `\n\n... truncated (${fullOutput.length} total chars)`;
  } else {
    output += fullOutput;
  }

  return output;
}

async function detectTools(fs: IFileSystem, cwd?: string): Promise<DetectedTool[]> {
  const base = cwd ?? ".";
  const tools: DetectedTool[] = [];

  // TypeScript
  if (await fs.exists(`${base}/tsconfig.json`)) {
    tools.push({ name: "tsc", command: "npx tsc --noEmit" });
  }

  // ESLint (check multiple config patterns)
  const eslintConfigs = [
    ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml",
    "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts",
  ];
  for (const config of eslintConfigs) {
    if (await fs.exists(`${base}/${config}`)) {
      tools.push({ name: "eslint", command: "npx eslint ." });
      break;
    }
  }

  // Also check package.json for eslint in dependencies
  if (!tools.some((t) => t.name === "eslint")) {
    try {
      const pkgContent = await fs.readFile(`${base}/package.json`);
      const pkg = JSON.parse(pkgContent);
      const allDeps = { ...pkg?.dependencies, ...pkg?.devDependencies };
      if (allDeps?.eslint) {
        tools.push({ name: "eslint", command: "npx eslint ." });
      }
    } catch {
      // no package.json
    }
  }

  // Biome
  if (await fs.exists(`${base}/biome.json`) || await fs.exists(`${base}/biome.jsonc`)) {
    tools.push({ name: "biome", command: "npx biome check ." });
  }

  // Pyright
  if (await fs.exists(`${base}/pyrightconfig.json`)) {
    tools.push({ name: "pyright", command: "pyright" });
  }

  // Ruff (Python)
  try {
    const pyproject = await fs.readFile(`${base}/pyproject.toml`);
    if (pyproject.includes("[tool.ruff")) {
      tools.push({ name: "ruff", command: "ruff check ." });
    }
  } catch {
    // no pyproject.toml
  }
  if (!tools.some((t) => t.name === "ruff") && await fs.exists(`${base}/ruff.toml`)) {
    tools.push({ name: "ruff", command: "ruff check ." });
  }

  // golangci-lint
  const goLintConfigs = [".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"];
  for (const config of goLintConfigs) {
    if (await fs.exists(`${base}/${config}`)) {
      tools.push({ name: "golangci-lint", command: "golangci-lint run ./..." });
      break;
    }
  }

  return tools;
}

function buildCommand(name: DiagnosticTool, path?: string, fix?: boolean): string {
  switch (name) {
    case "tsc":
      // tsc doesn't support single-file checking well; path is ignored
      return "npx tsc --noEmit";
    case "eslint":
      return `npx eslint${fix ? " --fix" : ""} ${path ?? "."}`;
    case "biome":
      return `npx biome ${fix ? "check --write" : "check"} ${path ?? "."}`;
    case "pyright":
      return `pyright${path ? ` ${path}` : ""}`;
    case "ruff":
      return `ruff ${fix ? "check --fix" : "check"} ${path ?? "."}`;
    case "golangci-lint":
      return `golangci-lint run ${path ?? "./..."}`;
  }
}

function parseSummary(name: string, output: string, exitCode: number): string | null {
  if (exitCode === 0) return "No issues found";

  // tsc: "Found X errors in Y files."
  const tscMatch = output.match(/Found (\d+) errors? in (\d+) files?/);
  if (tscMatch) return `${tscMatch[1]} error(s) in ${tscMatch[2]} file(s)`;

  // tsc single-file: "error TS" count
  const tsErrors = output.match(/error TS\d+/g);
  if (tsErrors) return `${tsErrors.length} TypeScript error(s)`;

  // eslint: "X problems (Y errors, Z warnings)"
  const eslintMatch = output.match(/(\d+) problems?\s*\((\d+) errors?,\s*(\d+) warnings?\)/);
  if (eslintMatch) return `${eslintMatch[2]} error(s), ${eslintMatch[3]} warning(s)`;

  // pyright: "X errors, Y warnings, Z informations"
  const pyrightMatch = output.match(/(\d+) errors?,\s*(\d+) warnings?,\s*(\d+) informations?/);
  if (pyrightMatch) return `${pyrightMatch[1]} error(s), ${pyrightMatch[2]} warning(s)`;

  // ruff: "Found X errors"
  const ruffMatch = output.match(/Found (\d+) errors?/);
  if (ruffMatch) return `${ruffMatch[1]} issue(s)`;

  // Count lines as a fallback (each non-empty line is roughly one issue)
  const issueLines = output.split("\n").filter((l) => l.trim().length > 0).length;
  return `${issueLines} line(s) of output (exit code ${exitCode})`;
}
