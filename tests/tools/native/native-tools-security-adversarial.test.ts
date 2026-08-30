import { describe, it, expect } from "vitest";
import { resolveSafePath } from "../../../src/tools/native/path-utils.js";
import { ToolRegistry } from "../../../src/tools/tool-registry.js";
import { registerNativeTools } from "../../../src/tools/native/register-native-tools.js";

describe("P4.3 Native Tools — Adversarial Security Boundary", () => {
  it("rejects path traversal attacks including URL encoding and null bytes", () => {
    const root = "C:/safe_project";

    expect(() => resolveSafePath(root, "../secret.env")).toThrow("attempts to escape project boundary");
    expect(() => resolveSafePath(root, "docs/%2e%2e/secret.env")).toThrow("Encoded traversal sequence detected");
    expect(() => resolveSafePath(root, "docs/file.txt\0.js")).toThrow("Null byte detected");
  });

  it("registers all native tools with strict schemas and appropriate risk tiering", () => {
    const registry = new ToolRegistry();
    registerNativeTools(registry);

    expect(registry.has("read_file")).toBe(true);
    expect(registry.get("read_file")?.definition.riskLevel).toBe("low");

    expect(registry.has("run_command")).toBe(true);
    expect(registry.get("run_command")?.definition.riskLevel).toBe("high");

    expect(registry.has("delete_file")).toBe(true);
    expect(registry.get("delete_file")?.definition.riskLevel).toBe("high");

    expect(registry.has("save_artifact")).toBe(true);
    expect(registry.get("save_artifact")?.definition.riskLevel).toBe("medium");
  });
});
