import { describe, it, expect } from "vitest";
import { LocalExecutor } from "../../src/execution/local-executor.js";
import { ProcessSupervisor } from "../../src/execution/process-supervisor.js";

describe("P4.4 Process Tree Cancellation & Timeout", () => {
  it("terminates long-running process when timeout limit is reached", async () => {
    const supervisor = new ProcessSupervisor();
    const executor = new LocalExecutor({ supervisor });

    const result = await executor.execute({
      executionId: "exec_timeout_01",
      command: "node -e \"setTimeout(() => {}, 60000);\"",
      timeoutMs: 300,
    });

    expect(result.status).toBe("timed_out");
    expect(result.error).toContain("timed out");
  });

  it("cancels active process handle and kills process tree on explicit supervisor cancel", async () => {
    const supervisor = new ProcessSupervisor();
    const executor = new LocalExecutor({ supervisor });

    const execPromise = executor.execute({
      executionId: "exec_cancel_01",
      command: "node -e \"setTimeout(() => {}, 60000);\"",
      timeoutMs: 10000,
    });

    // Let it start
    await new Promise((r) => setTimeout(r, 100));

    const cancelled = await supervisor.cancel("exec_cancel_01", "User abort");
    expect(cancelled).toBe(true);

    const result = await execPromise;
    expect(["cancelled", "killed", "failed"]).toContain(result.status);
  }, 15000);
});
