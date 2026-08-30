import { describe, it, expect } from "vitest";
import {
  ExecutionRequestSchema,
  ExecutionResultSchema,
  ExecutorTypeSchema,
  ExecutionStatusSchema,
  ProcessLifecycleStateSchema,
} from "../../src/domain/execution.js";

describe("P4.4 Execution Contracts & Zod Schemas", () => {
  it("validates execution requests with default local executor and limits", () => {
    const validReq = ExecutionRequestSchema.parse({
      executionId: "exec_01",
      command: "node -v",
      timeoutMs: 5000,
    });

    expect(validReq.executorType).toBe("local");
    expect(validReq.command).toBe("node -v");
  });

  it("validates execution results and status constraints", () => {
    const result = ExecutionResultSchema.parse({
      executionId: "exec_01",
      executorType: "local",
      status: "completed",
      exitCode: 0,
      stdout: "v22.0.0",
      stderr: "",
      durationMs: 120,
    });

    expect(result.status).toBe("completed");
    expect(result.exitCode).toBe(0);
  });

  it("rejects invalid executor types and states", () => {
    expect(() => ExecutorTypeSchema.parse("quantum")).toThrow();
    expect(() => ExecutionStatusSchema.parse("paused")).toThrow();
    expect(() => ProcessLifecycleStateSchema.parse("sleeping")).toThrow();
  });
});
