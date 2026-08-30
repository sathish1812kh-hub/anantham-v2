import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../../src/tools/tool-registry.js";

describe("P4.2 Tool Registry — Registration, Lookup & Uniqueness", () => {
  it("registers and retrieves tools successfully", () => {
    const registry = new ToolRegistry();

    registry.register({
      definition: {
        name: "test_tool",
        parametersSchema: { type: "object" },
        isIdempotent: true,
      },
      handler: async () => ({ ok: true }),
    });

    expect(registry.has("test_tool")).toBe(true);
    expect(registry.get("test_tool")?.definition.name).toBe("test_tool");
    expect(registry.list().length).toBe(1);
  });

  it("rejects duplicate tool registration with same name", () => {
    const registry = new ToolRegistry();

    registry.register({
      definition: {
        name: "duplicate_tool",
        parametersSchema: {},
        isIdempotent: false,
      },
      handler: async () => "first",
    });

    expect(() =>
      registry.register({
        definition: {
          name: "duplicate_tool",
          parametersSchema: {},
          isIdempotent: false,
        },
        handler: async () => "second",
      })
    ).toThrow('Tool with name "duplicate_tool" is already registered.');
  });
});
