import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { NodeRepository } from "../../src/persistence/repositories/node-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { NodeRegistry } from "../../src/remote/node-registry.js";

describe("P7.4 Remote Nodes — Registration & Version Compatibility", () => {
  let engine: SqliteEngine;
  let nodeRepo: NodeRepository;
  let eventStore: EventStore;
  let nodeRegistry: NodeRegistry;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    nodeRepo = new NodeRepository(engine);
    eventStore = new EventStore(engine);

    nodeRegistry = new NodeRegistry({
      nodeRepo,
      eventStore,
      supportedRuntimeVersions: ["2.0.0", "2.0.0-alpha.1"],
    });
  });

  afterEach(() => {
    engine.close();
  });

  it("registers a compatible remote worker node and marks it ONLINE", () => {
    const node = nodeRegistry.registerNode({
      id: "node_gpu_01",
      nodeVersion: "1.2.0",
      runtimeVersion: "2.0.0",
      endpointUrl: "https://node01.internal:9000",
      capabilities: ["gpu", "cuda12", "python311"],
      executorProfiles: ["docker", "local"],
      projectScope: ["proj_ai_*"],
    });

    expect(node.id).toBe("node_gpu_01");
    expect(node.status).toBe("ONLINE");
    expect(node.capabilities).toContain("gpu");

    // Verify persisted in NodeRepository
    const fetched = nodeRepo.findNodeById("node_gpu_01");
    expect(fetched).toBeDefined();
    expect(fetched?.capabilities).toContain("cuda12");
  });

  it("rejects registration from an incompatible runtime version", () => {
    expect(() => {
      nodeRegistry.registerNode({
        id: "node_legacy_01",
        nodeVersion: "0.5.0",
        runtimeVersion: "1.0.0", // Incompatible!
        endpointUrl: "https://legacy.internal:9000",
      });
    }).toThrow("Incompatible node runtime version");
  });

  it("detects stalled nodes when heartbeats cease", () => {
    const node = nodeRegistry.registerNode({
      id: "node_temp_01",
      nodeVersion: "1.0.0",
      runtimeVersion: "2.0.0",
      endpointUrl: "https://temp.internal:9000",
    });

    // Artificially age the heartbeat
    nodeRepo.updateHeartbeat(node.id, new Date(Date.now() - 60000).toISOString(), "ONLINE");

    const stalledIds = nodeRegistry.detectStalledNodes(30000);
    expect(stalledIds).toContain("node_temp_01");

    const updatedNode = nodeRepo.findNodeById("node_temp_01");
    expect(updatedNode?.status).toBe("OFFLINE");
  });
});
