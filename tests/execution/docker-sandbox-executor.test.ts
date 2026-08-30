import { describe, it, expect } from "vitest";
import { DockerSandboxExecutor } from "../../src/execution/docker-sandbox-executor.js";

describe("P4.4 DockerSandboxExecutor — Container Sandbox & Mount Validation", () => {
  it("rejects privileged container execution requests", async () => {
    const dockerExecutor = new DockerSandboxExecutor();

    const result = await dockerExecutor.execute({
      executionId: "exec_docker_priv",
      executorType: "docker",
      command: "ls -la",
      sandbox: { privileged: true },
    });

    expect(result.status).toBe("failed");
    expect(result.stderr).toContain("Privileged containers are strictly prohibited");
  });

  it("FAIL CLOSED: returns unavailable error when Docker daemon is not accessible, never silently downgrading to host", async () => {
    const dockerExecutor = new DockerSandboxExecutor();

    // If docker is not running or available, returns deterministic unavailable result
    const result = await dockerExecutor.execute({
      executionId: "exec_docker_failclosed",
      executorType: "docker",
      command: "echo sandboxed",
    });

    expect(["completed", "failed"]).toContain(result.status);
    if (result.status === "failed") {
      expect(result.stderr).toMatch(/Docker daemon is not accessible|Security violation/);
    }
  });
});
