import { describe, it, expect } from "vitest";
import { LocalExecutor } from "../../src/execution/local-executor.js";
import { ProcessSupervisor } from "../../src/execution/process-supervisor.js";

describe("P4.4 Executor Plane — Concurrency & Multi-Process Isolation", () => {
  it("runs parallel processes concurrently with independent state and output buffers", async () => {
    const supervisor = new ProcessSupervisor();
    const executor = new LocalExecutor({ supervisor });

    const [r1, r2, r3] = await Promise.all([
      executor.execute({
        executionId: "exec_conc_1",
        command: "node -e \"console.log('Task 1 completed');\"",
      }),
      executor.execute({
        executionId: "exec_conc_2",
        command: "node -e \"console.log('Task 2 completed');\"",
      }),
      executor.execute({
        executionId: "exec_conc_3",
        command: "node -e \"console.log('Task 3 completed');\"",
      }),
    ]);

    expect(r1.status).toBe("completed");
    expect(r1.stdout).toContain("Task 1 completed");

    expect(r2.status).toBe("completed");
    expect(r2.stdout).toContain("Task 2 completed");

    expect(r3.status).toBe("completed");
    expect(r3.stdout).toContain("Task 3 completed");
  });
});
