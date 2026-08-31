import { describe, it, expect } from "vitest";
import { PluginCompatibilityChecker } from "../../src/plugins/plugin-compatibility.js";

describe("P5.2 Plugins — Platform & Runtime Compatibility", () => {
  it("passes when OS, Node version, and runtime match environment", () => {
    const checker = new PluginCompatibilityChecker({
      os: "win32",
      nodeVersion: "v22.5.1",
      runtimeVersion: "2.0.0",
    });

    const result = checker.checkCompatibility({
      os: ["win32", "linux"],
      node: ">=20.0.0",
      runtime: "anantham>=2.0",
      capabilities: ["tools", "sqlite"],
    }, ["tools", "sqlite"]);

    expect(result.isCompatible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("fails when OS is incompatible", () => {
    const checker = new PluginCompatibilityChecker({ os: "win32" });

    const result = checker.checkCompatibility({
      os: ["linux", "darwin"],
    });

    expect(result.isCompatible).toBe(false);
    expect(result.reasons[0]).toContain("Incompatible OS");
  });

  it("fails when Node.js major version is below requirement", () => {
    const checker = new PluginCompatibilityChecker({ nodeVersion: "v18.19.0" });

    const result = checker.checkCompatibility({
      node: ">=20.0.0",
    });

    expect(result.isCompatible).toBe(false);
    expect(result.reasons[0]).toContain("Incompatible Node.js version");
  });

  it("fails when required runtime capability is missing", () => {
    const checker = new PluginCompatibilityChecker();

    const result = checker.checkCompatibility({
      capabilities: ["gpu_accelerator"],
    }, ["tools", "sqlite"]);

    expect(result.isCompatible).toBe(false);
    expect(result.reasons[0]).toContain("Missing required capability");
  });
});
