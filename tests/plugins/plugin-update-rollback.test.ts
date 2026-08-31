import { describe, it, expect, beforeEach } from "vitest";
import { PluginManager } from "../../src/plugins/plugin-manager.js";
import { PluginStateManager } from "../../src/plugins/plugin-state.js";
import { type PluginManifest } from "../../src/domain/plugin.js";

describe("P5.2 Plugins — Atomic Update, Rollback & State Migration", () => {
  let manager: PluginManager;
  let stateManager: PluginStateManager;

  const v1Manifest: PluginManifest = {
    id: "db.migrator",
    name: "DB Migrator",
    version: "1.0.0",
    stateVersion: 1,
    checksum: "hash_v1",
  };

  const v2Manifest: PluginManifest = {
    id: "db.migrator",
    name: "DB Migrator",
    version: "2.0.0",
    stateVersion: 2,
    checksum: "hash_v2",
  };

  beforeEach(() => {
    manager = new PluginManager();
    stateManager = new PluginStateManager();
  });

  it("updates plugin atomically and preserves rollback snapshot", () => {
    manager.install(v1Manifest);
    manager.activate(v1Manifest.id);

    const updated = manager.update(v2Manifest);
    expect(updated.manifest.version).toBe("2.0.0");
    expect(updated.previousVersion?.manifest.version).toBe("1.0.0");

    // Rollback
    const rolledBack = manager.rollback(v1Manifest.id);
    expect(rolledBack.manifest.version).toBe("1.0.0");
  });

  it("migrates plugin state deterministically across versions", () => {
    stateManager.setState("db.migrator", { tablePrefix: "legacy_" }, 1);

    stateManager.registerMigration("db.migrator", {
      fromVersion: 1,
      toVersion: 2,
      migrate: (oldState) => ({
        ...oldState,
        tablePrefix: "modern_",
        schemaV2Active: true,
      }),
    });

    const newState = stateManager.migrateState("db.migrator", 2);
    expect(newState.tablePrefix).toBe("modern_");
    expect(newState.schemaV2Active).toBe(true);
    expect(stateManager.getStateVersion("db.migrator")).toBe(2);
  });
});
