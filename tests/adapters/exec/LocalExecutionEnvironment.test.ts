import { describe, it, expect } from "vitest";
import { LocalExecutionEnvironment } from "#adapters/exec/LocalExecutionEnvironment.js";

describe("LocalExecutionEnvironment", () => {
  const exec = new LocalExecutionEnvironment();

  it("runs a command and returns stdout", async () => {
    const result = await exec.execute("echo hello");
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  it("captures stderr", async () => {
    const result = await exec.execute("echo error >&2");
    expect(result.stderr.trim()).toBe("error");
  });

  it("returns non-zero exit code on failure", async () => {
    const result = await exec.execute("exit 42");
    expect(result.exitCode).toBe(42);
  });

  it("respects cwd parameter", async () => {
    const result = await exec.execute("node -e \"process.stdout.write(process.cwd())\"", process.cwd());
    expect(result.stdout).toBe(process.cwd());
    expect(result.exitCode).toBe(0);
  });
});
