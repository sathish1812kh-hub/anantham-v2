import { describe, it, expect, beforeEach } from "vitest";
import { PluginRegistry } from "../../src/plugins/plugin-registry.js";
import { PluginManager } from "../../src/plugins/plugin-manager.js";

describe("P5.2 Plugins — Project-Level Version Pinning", () => {
  let registry: PluginRegistry;
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
    registry = new PluginRegistry(manager);
  });

  it("locks plugin version at project level and prevents unpinned silent upgrade", () => {
    // Install global plugin v2.0.0
    manager.install({
      id: "compiler.ts",
      name: "TS Compiler",
      version: "2.0.0",
      checksum: "hash_ts_2",
    });
    manager.activate("compiler.ts");

    // Project Alpha pins to v1.5.0
    registry.setProjectPins("prj_alpha", {
      "compiler.ts": "1.5.0",
    });

    const effectiveForAlpha = registry.getEffectivePlugin("compiler.ts", "prj_alpha");
    expect(effectiveForAlpha?.projectPin).toBe("1.5.0");

    // Unpinned Project Beta gets current 2.0.0
    const effectiveForBeta = registry.getEffectivePlugin("compiler.ts", "prj_beta");
    expect(effectiveForBeta?.projectPin).toBeUndefined();
    expect(effectiveForBeta?.manifest.version).toBe("2.0.0");
  });
});
