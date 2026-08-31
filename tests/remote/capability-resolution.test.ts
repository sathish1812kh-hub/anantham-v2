import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { NodeRepository } from "../../src/persistence/repositories/node-repository.js";
import { NodeRegistry } from "../../src/remote/node-registry.js";

describe("P7.4 Remote Nodes — Capability Resolution & Matching", () => {
  let engine: SqliteEngine;
  let nodeRepo: NodeRepository;
  let nodeRegistry: NodeRegistry;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    nodeRepo = new NodeRepository(engine);
    nodeRegistry = new NodeRegistry({ nodeRepo });

    // Node 1: CPU node for Project A
    nodeRegistry.registerNode({
      id: "node_cpu_A",
      nodeVersion: "1.0.0",
      runtimeVersion: "2.0.0",
      capabilities: ["cpu", "x86_64"],
      executorProfiles: ["local"],
      projectScope: ["proj_A"],
      endpointUrl: "https://cpu-a:8000",
    });

    // Node 2: GPU node for wildcard projects
    nodeRegistry.registerNode({
      id: "node_gpu_global",
      nodeVersion: "1.0.0",
      runtimeVersion: "2.0.0",
      capabilities: ["gpu", "cuda12", "python"],
      executorProfiles: ["docker"],
      projectScope: ["*"],
      endpointUrl: "https://gpu-global:8000",
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("finds GPU node when GPU capability is requested", () => {
    const matched = nodeRegistry.findEligibleNode(["gpu", "cuda12"], "proj_B", "docker");
    expect(matched).toBeDefined();
    expect(matched?.id).toBe("node_gpu_global");
  });

  it("rejects CPU node for Project B due to project isolation boundary", () => {
    const matched = nodeRegistry.findEligibleNode(["cpu"], "proj_B", "local");
    expect(matched).toBeNull();
  });

  it("returns null when no node satisfies required capability subset", () => {
    const matched = nodeRegistry.findEligibleNode(["quantum_qpu"], "proj_A");
    expect(matched).toBeNull();
  });
});
