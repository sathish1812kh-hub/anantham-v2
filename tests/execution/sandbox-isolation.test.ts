import { describe, it, expect } from "vitest";
import { SandboxManager } from "../../src/execution/sandbox-manager.js";
import type { ToolExecutionRequest } from "../../src/execution/types.js";

describe("PRD-EXEC-004: Execution Isolation & Sandboxing", () => {
  const manager = new SandboxManager();

  it("creates sandbox and prevents filesystem path traversal outside permitted root", () => {
    const sandbox = manager.createSandbox("sess_iso", "local_direct", "/workspace/project", {
      isNetworkAllowed: false,
    });

    const insideReq: ToolExecutionRequest = {
      id: "req_in",
      toolName: "write_to_file",
      action: "Writing",
      arguments: { TargetFile: "/workspace/project/src/index.ts" },
      sessionId: "sess_iso",
      agentId: "agent_iso",
      workspaceRoot: "/workspace/project",
    };

    const insideCheck = manager.enforceSandboxBoundaries(sandbox, insideReq);
    expect(insideCheck.allowed).toBe(true);

    const escapeReq: ToolExecutionRequest = {
      id: "req_out",
      toolName: "write_to_file",
      action: "Writing",
      arguments: { TargetFile: "/etc/passwd" },
      sessionId: "sess_iso",
      agentId: "agent_iso",
      workspaceRoot: "/workspace/project",
    };

    const escapeCheck = manager.enforceSandboxBoundaries(sandbox, escapeReq);
    expect(escapeCheck.allowed).toBe(false);
    expect(escapeCheck.reason).toContain("escapes allowed sandbox directories");
  });

  it("enforces network isolation when network is forbidden in sandbox", () => {
    const sandbox = manager.createSandbox("sess_no_net", "container", "/workspace", {
      isNetworkAllowed: false,
    });

    const netReq: ToolExecutionRequest = {
      id: "req_net",
      toolName: "read_url_content",
      action: "Fetching",
      arguments: { Url: "https://evil.com" },
      sessionId: "sess_no_net",
      agentId: "agent_iso",
      workspaceRoot: "/workspace",
    };

    const netCheck = manager.enforceSandboxBoundaries(sandbox, netReq);
    expect(netCheck.allowed).toBe(false);
    expect(netCheck.reason).toContain("Network access is disabled");
  });
});
