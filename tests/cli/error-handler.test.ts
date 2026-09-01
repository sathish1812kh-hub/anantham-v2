import { describe, it, expect } from "vitest";
import { CliErrorHandler } from "../../src/cli/error-handler.js";

describe("P8.1 CLI — Error Handler & Classification", () => {
  const handler = new CliErrorHandler();

  it("classifies policy denials and risk violations", () => {
    const res = handler.handleError("tools", new Error("Denied by policy: tool requires human approval."));
    expect(res.success).toBe(false);
    expect(res.classification).toBe("POLICY_DENIAL");
  });

  it("classifies permission denials", () => {
    const res = handler.handleError("workspace", new Error("Unauthorized permission: actor cannot write to root."));
    expect(res.classification).toBe("PERMISSION_DENIED");
  });

  it("classifies validation and schema errors", () => {
    const res = handler.handleError("task", new Error("Validation failed: invalid schema format for objective."));
    expect(res.classification).toBe("VALIDATION_ERROR");
  });

  it("classifies entity not found errors", () => {
    const res = handler.handleError("session", new Error("Session 'sess_999' not found."));
    expect(res.classification).toBe("NOT_FOUND");
  });

  it("classifies lease fencing errors", () => {
    const res = handler.handleError("task", new Error("FENCING_VIOLATION: stale lease generation."));
    expect(res.classification).toBe("LEASE_FENCING_ERROR");
  });

  it("classifies recovery errors", () => {
    const res = handler.handleError("resume", new Error("Recovery failed: corrupted orphan record."));
    expect(res.classification).toBe("RECOVERY_ERROR");
  });

  it("classifies user cancellations", () => {
    const res = handler.handleError("workflow", new Error("Execution cancelled by user."));
    expect(res.classification).toBe("USER_CANCELLATION");
  });
});
