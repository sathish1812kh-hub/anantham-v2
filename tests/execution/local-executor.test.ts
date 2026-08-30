import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalExecutor } from "../../src/execution/local-executor.js";

describe("P4.4 LocalExecutor — Bounded Process Execution", () => {
  let tempDir: string;
  let executor: LocalExecutor;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham_local_exec_"));
    executor = new LocalExecutor({ defaultProjectRoot: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("executes valid commands with cwd containment and captures output", async () => {
    fs.writeFileSync(path.join(tempDir, "script.js"), "console.log('Anantham Execution Engine');");

    const result = await executor.execute({
      executionId: "exec_local_01",
      command: "node script.js",
      projectRoot: tempDir,
    });

    expect(result.status).toBe("completed");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Anantham Execution Engine");
  });

  it("truncates excessive stdout when output limit is exceeded", async () => {
    const result = await executor.execute({
      executionId: "exec_local_trunc",
      command: "node -e \"console.log('A'.repeat(5000));\"",
      maxOutputBytes: 100,
    });

    expect(result.truncated).toBe(true);
    expect(result.stdout).toContain("[STDOUT_TRUNCATED]");
  });

  it("redacts raw secrets matching sk-* in stdout and stderr", async () => {
    const result = await executor.execute({
      executionId: "exec_local_redact",
      command: "node -e \"console.log('My key is sk-1234567890abcdef12345');\"",
    });

    expect(result.stdout).toContain("[REDACTED_SECRET]");
    expect(result.stdout).not.toContain("sk-1234567890abcdef12345");
  });
});
