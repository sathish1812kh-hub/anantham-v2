import { describe, it, expect } from "vitest";
import {
  ToolSpecSchema,
  ToolInvocationRequestSchema,
  ToolObservationSchema,
} from "../../src/domain/tool.js";

describe("P4.2 Tool Contracts Validation", () => {
  it("validates ToolSpecSchema correctly", () => {
    const validTool = {
      name: "read_file",
      description: "Reads file content safely",
      parametersSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      isIdempotent: true,
      riskLevel: "low",
    };
    expect(ToolSpecSchema.safeParse(validTool).success).toBe(true);
  });

  it("validates ToolInvocationRequestSchema correctly", () => {
    const validReq = {
      callId: "call_12345",
      toolName: "read_file",
      arguments: { path: "src/index.ts" },
      actor: { id: "agent_dev", type: "agent" },
      project: { id: "prj_main" },
      idempotencyKey: "idem_987",
    };
    expect(ToolInvocationRequestSchema.safeParse(validReq).success).toBe(true);
  });

  it("validates ToolObservationSchema correctly", () => {
    const validObs = {
      callId: "call_12345",
      toolName: "read_file",
      status: "success",
      result: { content: "console.log('hello');" },
      durationMs: 12,
      executedAt: new Date().toISOString(),
      idempotencyKey: "idem_987",
    };
    expect(ToolObservationSchema.safeParse(validObs).success).toBe(true);
  });
});
