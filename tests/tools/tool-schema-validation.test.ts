import { describe, it, expect } from "vitest";
import { ToolGateway } from "../../src/tools/tool-gateway.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";

describe("P4.2 Tool Gateway — Runtime Schema Validation & Prototype Pollution Defense", () => {
  const schema = {
    type: "object",
    properties: {
      filename: { type: "string" },
      lineCount: { type: "number" },
      isRecursive: { type: "boolean" },
    },
    required: ["filename", "lineCount"],
  };

  it("validates compliant arguments successfully", () => {
    const res = ToolGateway.validateArguments(
      { filename: "test.ts", lineCount: 10, isRecursive: true },
      schema
    );
    expect(res.valid).toBe(true);
  });

  it("rejects missing required parameters", () => {
    const res = ToolGateway.validateArguments({ filename: "test.ts" }, schema);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Missing required argument: "lineCount"');
  });

  it("rejects mismatched argument types", () => {
    const res = ToolGateway.validateArguments(
      { filename: "test.ts", lineCount: "not_a_number" as any },
      schema
    );
    expect(res.valid).toBe(false);
    expect(res.error).toContain('must be a number');
  });

  it("PROTOTYPE POLLUTION DEFENSE: Rejects malicious payload targeting __proto__", () => {
    const poisoned = JSON.parse('{"filename":"test.ts","lineCount":5,"__proto__":{"admin":true}}');
    const res = ToolGateway.validateArguments(poisoned, schema);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Prototype pollution payload detected");
  });

  it("gateway rejects schema violation before handler execution", async () => {
    const registry = new ToolRegistry();
    let handlerExecuted = false;

    registry.register({
      definition: {
        name: "test_schema_tool",
        parametersSchema: schema,
        isIdempotent: false,
      },
      handler: async () => {
        handlerExecuted = true;
        return "success";
      },
    });

    const gateway = new ToolGateway({ registry });
    const observation = await gateway.invoke({
      callId: "call_fail_schema",
      toolName: "test_schema_tool",
      arguments: { filename: "test.ts" }, // missing lineCount
      actor: { id: "agent_tester", type: "agent" },
      project: { id: "prj_main" },
    });

    expect(handlerExecuted).toBe(false);
    expect(observation.status).toBe("failure");
    expect(observation.error?.code).toBe("SCHEMA_VALIDATION_ERROR");
  });
});
