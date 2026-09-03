import { describe, it, expect } from "vitest";
import { ToolGatewayOrchestrator } from "../../src/execution/tool-gateway-orchestrator.js";
import type { ToolExecutionRequest } from "../../src/execution/types.js";

describe("PRD-EXEC-002: Execution Engine Architecture", () => {
  it("routes tool execution strictly through ToolGateway with schema, approval, and audit recording", async () => {
    const gateway = new ToolGatewayOrchestrator({
      policy: { maxRiskLevelWithoutApproval: "read" },
    });

    const readRequest: ToolExecutionRequest = {
      id: "req_001",
      toolName: "view_file",
      action: "Viewing file",
      arguments: { AbsolutePath: "/workspace/src/index.ts" },
      sessionId: "sess_test",
      agentId: "agent_coder",
      workspaceRoot: "/workspace",
    };

    // Read tool executes without requiring user approval
    const resultRead = await gateway.executeTool(readRequest, async (req) => {
      return { fileContent: "console.log('hello');" };
    });

    expect(resultRead.success).toBe(true);
    expect(resultRead.riskLevel).toBe("read");
    expect(resultRead.requiresApproval).toBe(false);
    expect(resultRead.auditRecordId).toBeDefined();

    // Write tool requires approval when threshold is 'read'
    const writeRequest: ToolExecutionRequest = {
      id: "req_002",
      toolName: "write_to_file",
      action: "Writing file",
      arguments: { TargetFile: "/workspace/src/index.ts", CodeContent: "test" },
      sessionId: "sess_test",
      agentId: "agent_coder",
      workspaceRoot: "/workspace",
    };

    const resultWriteUnapproved = await gateway.executeTool(writeRequest, async () => {
      return { written: true };
    });

    expect(resultWriteUnapproved.success).toBe(false);
    expect(resultWriteUnapproved.requiresApproval).toBe(true);
    expect(resultWriteUnapproved.error).toContain("requires user approval");

    // Once user provides approval, write succeeds
    const resultWriteApproved = await gateway.executeTool(
      writeRequest,
      async () => ({ written: true }),
      true // approved
    );

    expect(resultWriteApproved.success).toBe(true);
    expect(resultWriteApproved.approvedByUser).toBe(true);

    // Audit log records all attempts
    const auditLog = gateway.getAuditLog();
    expect(auditLog.length).toBe(3);
  });
});
