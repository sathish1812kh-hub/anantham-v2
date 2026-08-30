import { describe, it, expect } from "vitest";
import { RemoteExecutor } from "../../src/execution/remote-executor.js";

describe("P4.4 RemoteExecutor — Remote Worker Interface & Unavailability Semantics", () => {
  it("returns deterministic executor-unavailable failure when remote worker pool is not configured", async () => {
    const remote = new RemoteExecutor();

    expect(remote.isConfigured()).toBe(false);

    const result = await remote.execute({
      executionId: "exec_remote_unavail",
      executorType: "remote",
      command: "pytest",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Remote executor not configured");
  });

  it("dispatches remote commands when configured", async () => {
    const remote = new RemoteExecutor({ remoteEndpoint: "https://workers.anantham.internal/api/v1/exec" });

    expect(remote.isConfigured()).toBe(true);

    const result = await remote.execute({
      executionId: "exec_remote_ok",
      executorType: "remote",
      command: "echo 1",
    });

    expect(result.status).toBe("completed");
    expect(result.stdout).toContain("https://workers.anantham.internal");
  });
});
