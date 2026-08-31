import { describe, it, expect, beforeEach } from "vitest";
import { PluginManager } from "../../src/plugins/plugin-manager.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { type PluginManifest } from "../../src/domain/plugin.js";

describe("P5.2 Plugins — Full Lifecycle State Machine", () => {
  let manager: PluginManager;
  let toolRegistry: ToolRegistry;

  const sampleManifest: PluginManifest = {
    id: "tools.linter",
    name: "Linter Plugin",
    version: "1.0.0",
    classes: ["tool"],
    provides: ["tool:eslint_check"],
    permissions: { filesystem: { read: [], write: [] } },
    checksum: "checksum_sample_01",
  };

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    manager = new PluginManager({ toolRegistry });
  });

  it("transitions through discovery, installation, and activation", () => {
    // 1. Discover
    const discovered = manager.discover(sampleManifest);
    expect(discovered.lifecycleState).toBe("discovered");

    // 2. Install
    const installed = manager.install(sampleManifest);
    expect(installed.lifecycleState).toBe("installed");

    // 3. Activate
    const active = manager.activate(sampleManifest.id);
    expect(active.lifecycleState).toBe("active");
    expect(toolRegistry.has("plugin_tools_linter_eslint_check")).toBe(true);
  });

  it("disables an active plugin and synchronously clears registered tools", () => {
    manager.install(sampleManifest);
    manager.activate(sampleManifest.id);
    expect(toolRegistry.has("plugin_tools_linter_eslint_check")).toBe(true);

    const disabled = manager.disable(sampleManifest.id);
    expect(disabled.lifecycleState).toBe("disabled");
    expect(toolRegistry.has("plugin_tools_linter_eslint_check")).toBe(false);
  });

  it("unloads and reloads plugin without stale references", () => {
    manager.install(sampleManifest);
    manager.activate(sampleManifest.id);

    manager.unload(sampleManifest.id);
    expect(toolRegistry.has("plugin_tools_linter_eslint_check")).toBe(false);

    const reloaded = manager.reload(sampleManifest.id);
    expect(reloaded.lifecycleState).toBe("active");
    expect(toolRegistry.has("plugin_tools_linter_eslint_check")).toBe(true);
  });
});
