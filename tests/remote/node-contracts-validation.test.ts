import { describe, it, expect } from "vitest";
import {
  NodeStatusSchema,
  NodeIdentitySchema,
  RemoteDispatchStatusSchema,
  RemoteWorkRequestSchema,
  RemoteResultSchema,
} from "../../src/domain/node.js";

describe("P7.4 Remote Nodes — Contracts & Schema Validation", () => {
  it("validates valid NodeIdentity schema and populates defaults", () => {
    const rawNode = {
      id: "node_worker_01",
      nodeVersion: "1.0.0",
      runtimeVersion: "2.0.0",
      endpointUrl: "https://node01.internal:8443",
      registeredAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    };

    const parsed = NodeIdentitySchema.parse(rawNode);
    expect(parsed.status).toBe("REGISTERED");
    expect(parsed.executorProfiles).toEqual(["local"]);
    expect(parsed.projectScope).toEqual(["*"]);
    expect(parsed.capabilities).toEqual([]);
  });

  it("validates all 6 node lifecycle statuses", () => {
    const statuses = [
      "REGISTERED",
      "ONLINE",
      "BUSY",
      "DRAINING",
      "OFFLINE",
      "QUARANTINED",
    ];

    for (const s of statuses) {
      expect(NodeStatusSchema.parse(s)).toBe(s);
    }
  });

  it("validates all 9 remote dispatch statuses", () => {
    const statuses = [
      "DISPATCHED",
      "ACCEPTED",
      "REJECTED",
      "RUNNING",
      "COMPLETED",
      "FAILED",
      "TIMED_OUT",
      "CANCELLED",
      "RECLAIMED",
    ];

    for (const s of statuses) {
      expect(RemoteDispatchStatusSchema.parse(s)).toBe(s);
    }
  });

  it("validates RemoteWorkRequestSchema", () => {
    const req = {
      dispatchId: "disp_01",
      jobId: "job_01",
      taskId: "task_01",
      agentId: "agent_dev",
      instanceId: "inst_01",
      nodeId: "node_01",
      projectId: "proj_01",
      sessionId: "sess_01",
      generation: 1,
      leaseId: "lease_01",
      idempotencyKey: "idem_01",
      createdAt: new Date().toISOString(),
    };

    const parsed = RemoteWorkRequestSchema.parse(req);
    expect(parsed.generation).toBe(1);
    expect(parsed.status).toBe("DISPATCHED");
    expect(parsed.requiredCapabilities).toEqual([]);
  });

  it("validates RemoteResultSchema", () => {
    const res = {
      dispatchId: "disp_01",
      nodeId: "node_01",
      taskId: "task_01",
      jobId: "job_01",
      generation: 1,
      leaseId: "lease_01",
      status: "SUCCESS" as const,
      artifacts: ["art_01"],
      completedAt: new Date().toISOString(),
    };

    const parsed = RemoteResultSchema.parse(res);
    expect(parsed.status).toBe("SUCCESS");
    expect(parsed.artifacts).toEqual(["art_01"]);
    expect(parsed.consumption.tokens).toBe(0);
  });
});
