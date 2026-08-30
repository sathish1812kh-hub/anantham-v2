import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ToolGateway } from "../../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../../src/tools/tool-registry.js";
import { registerNativeTools } from "../../../src/tools/native/register-native-tools.js";
import { PolicyEngine } from "../../../src/policy/policy-engine.js";
import { ApprovalManager } from "../../../src/policy/approval-manager.js";

describe("P4.3 Native Tools — ToolGateway & Approval Pipeline Integration", () => {
  let tempDir: string;
  let registry: ToolRegistry;
  let policyEngine: PolicyEngine;
  let approvalManager: ApprovalManager;
  let gateway: ToolGateway;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anantham_gw_native_"));
    registry = new ToolRegistry();
    registerNativeTools(registry, { projectRoot: tempDir });
    policyEngine = new PolicyEngine();
    approvalManager = new ApprovalManager();
    gateway = new ToolGateway({ registry, policyEngine, approvalManager });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("LOW RISK (read_file): executes automatically without approval", async () => {
    fs.writeFileSync(path.join(tempDir, "hello.txt"), "world");

    const obs = await gateway.invoke({
      callId: "call_read",
      toolName: "read_file",
      arguments: { path: "hello.txt" },
      actor: { id: "agent_reader", type: "agent" },
      project: { id: "prj_test" },
    });

    expect(obs.status).toBe("success");
    expect((obs.result as any).content).toBe("world");
  });

  it("HIGH RISK (delete_file): requires approval and succeeds once approved", async () => {
    fs.writeFileSync(path.join(tempDir, "target.txt"), "delete me");

    // 1. Initial invocation halts on approval_required
    const obs1 = await gateway.invoke({
      callId: "call_del_1",
      toolName: "delete_file",
      arguments: { path: "target.txt" },
      actor: { id: "agent_cleaner", type: "agent" },
      project: { id: "prj_test" },
    });

    expect(obs1.status).toBe("approval_required");
    const approvalId = obs1.approvalId!;

    // 2. Human grants approval
    approvalManager.grantApproval(approvalId, "user_admin");

    // 3. Execution completes
    const obs2 = await gateway.invoke({
      callId: "call_del_2",
      toolName: "delete_file",
      arguments: { path: "target.txt" },
      actor: { id: "agent_cleaner", type: "agent" },
      project: { id: "prj_test" },
      approvalId,
    });

    expect(obs2.status).toBe("success");
    expect(fs.existsSync(path.join(tempDir, "target.txt"))).toBe(false);
  });
});
