import { describe, it, expect } from "vitest";
import { ExecutorRegistry } from "../../src/execution/executor-registry.js";

describe("P4.4 ExecutorRegistry — Multi-Executor Routing & Selection", () => {
  it("routes execution requests to appropriate executor type", async () => {
    const registry = new ExecutorRegistry();

    // Local
    const localRes = await registry.execute({
      executionId: "exec_reg_local",
      executorType: "local",
      command: "node -v",
    });
    expect(localRes.executorType).toBe("local");
    expect(localRes.status).toBe("completed");

    // Remote (unconfigured)
    const remoteRes = await registry.execute({
      executionId: "exec_reg_remote",
      executorType: "remote",
      command: "cargo build",
    });
    expect(remoteRes.executorType).toBe("remote");
    expect(remoteRes.status).toBe("failed");
  });
});
