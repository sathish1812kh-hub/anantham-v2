import { describe, it, expect } from "vitest";
import {
  PluginManifestSchema,
  PluginRecordSchema,
  PluginPinMapSchema,
} from "../../src/domain/plugin.js";

describe("P5.2 Plugins — Domain Contracts & Runtime Validation", () => {
  it("validates PluginManifestSchema accurately", () => {
    const validManifest = PluginManifestSchema.parse({
      id: "search.crawler",
      name: "Search Crawler Plugin",
      version: "1.2.0",
      description: "Fast multi-engine search crawler",
      publisher: "official",
      classes: ["tool", "connector"],
      runtime: "anantham>=2.0",
      provides: ["tool:web_crawl"],
      requires: ["network"],
      dependencies: [{ id: "core.network", version: "^1.0.0" }],
      permissions: {
        network: ["api.search.com"],
        filesystem: { read: ["./data"], write: [] },
      },
      checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });

    expect(validManifest.id).toBe("search.crawler");
    expect(validManifest.version).toBe("1.2.0");
    expect(validManifest.classes).toContain("tool");

    expect(() =>
      PluginManifestSchema.parse({
        id: "",
        name: "Invalid",
        version: "invalid_semver",
        checksum: "",
      })
    ).toThrow();
  });

  it("validates PluginRecordSchema and PluginPinMapSchema", () => {
    const manifest = PluginManifestSchema.parse({
      id: "code.analyzer",
      name: "Code Analyzer",
      version: "2.0.1",
      checksum: "sha256_mock_hash",
    });

    const record = PluginRecordSchema.parse({
      manifest,
      trustState: "trusted",
      lifecycleState: "active",
      healthState: "healthy",
      installPath: "C:/plugins/code.analyzer",
      installedAt: new Date().toISOString(),
      activeRegistrations: {
        tools: ["plugin_code_analyzer_ast"],
        commands: [],
        hooks: [],
        providers: [],
      },
    });

    expect(record.trustState).toBe("trusted");
    expect(record.lifecycleState).toBe("active");

    const pins = PluginPinMapSchema.parse({
      "code.analyzer": "2.0.1",
      "search.crawler": "1.0.0",
    });
    expect(pins["code.analyzer"]).toBe("2.0.1");
  });
});
