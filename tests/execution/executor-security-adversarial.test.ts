import { describe, it, expect } from "vitest";
import { LocalExecutor } from "../../src/execution/local-executor.js";
import { DockerSandboxExecutor } from "../../src/execution/docker-sandbox-executor.js";

describe("P4.4 Executor Plane — Adversarial Security Boundary", () => {
  it("LOCAL: rejects cwd path traversal outside project root boundary", async () => {
    const executor = new LocalExecutor({ defaultProjectRoot: "C:/safe_project" });

    await expect(
      executor.execute({
        executionId: "exec_bad_cwd",
        command: "dir",
        cwd: "../../../Windows/System32",
        projectRoot: "C:/safe_project",
      })
    ).rejects.toThrow("attempts to escape project boundary");
  });

  it("DOCKER: blocks mounting sensitive host system paths or sockets", async () => {
    const dockerExecutor = new DockerSandboxExecutor({ defaultProjectRoot: "C:/safe_project" });

    const result = await dockerExecutor.execute({
      executionId: "exec_bad_mount",
      executorType: "docker",
      command: "ls",
      projectRoot: "C:/safe_project",
      sandbox: {
        mounts: [{ hostPath: "/var/run/docker.sock", containerPath: "/var/run/docker.sock" }],
      },
    });

    expect(result.status).toBe("failed");
    expect(result.stderr).toContain("Security violation");
  });
});
