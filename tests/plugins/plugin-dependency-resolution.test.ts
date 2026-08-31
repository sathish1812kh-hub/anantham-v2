import { describe, it, expect } from "vitest";
import { PluginDependencyResolver } from "../../src/plugins/plugin-dependency.js";
import { type PluginManifest } from "../../src/domain/plugin.js";

describe("P5.2 Plugins — Dependency Graph Resolution", () => {
  const resolver = new PluginDependencyResolver();

  it("resolves linear dependencies in correct topological order", () => {
    const pluginA: PluginManifest = {
      id: "plugin.a",
      name: "Plugin A",
      version: "1.0.0",
      checksum: "hash_a",
      dependencies: [{ id: "plugin.b", version: "^1.0.0" }],
    };

    const pluginB: PluginManifest = {
      id: "plugin.b",
      name: "Plugin B",
      version: "1.2.0",
      checksum: "hash_b",
      dependencies: [],
    };

    const result = resolver.resolve([pluginA, pluginB]);
    expect(result.isResolved).toBe(true);
    expect(result.resolutionOrder.indexOf("plugin.b")).toBeLessThan(
      result.resolutionOrder.indexOf("plugin.a")
    );
  });

  it("detects missing dependencies and fails resolution", () => {
    const pluginA: PluginManifest = {
      id: "plugin.a",
      name: "Plugin A",
      version: "1.0.0",
      checksum: "hash_a",
      dependencies: [{ id: "plugin.missing", version: "1.0.0" }],
    };

    const result = resolver.resolve([pluginA]);
    expect(result.isResolved).toBe(false);
    expect(result.missingDependencies.length).toBe(1);
    expect(result.errors[0]).toContain("missing required dependency");
  });

  it("detects cyclic dependencies (A -> B -> A) and reports cycle", () => {
    const pluginA: PluginManifest = {
      id: "plugin.a",
      name: "Plugin A",
      version: "1.0.0",
      checksum: "hash_a",
      dependencies: [{ id: "plugin.b", version: "1.0.0" }],
    };

    const pluginB: PluginManifest = {
      id: "plugin.b",
      name: "Plugin B",
      version: "1.0.0",
      checksum: "hash_b",
      dependencies: [{ id: "plugin.a", version: "1.0.0" }],
    };

    const result = resolver.resolve([pluginA, pluginB]);
    expect(result.isResolved).toBe(false);
    expect(result.cyclicDependencies.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Cyclic dependency");
  });
});
