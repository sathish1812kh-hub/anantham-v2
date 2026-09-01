import { describe, it, expect, beforeEach } from "vitest";
import { AuditLogger } from "../../src/observability/audit-logger.js";
import { TelemetryEngine } from "../../src/observability/telemetry-engine.js";

describe("P8.5 Observability — Project Tenant Isolation Boundary", () => {
  let logger: AuditLogger;
  let telemetry: TelemetryEngine;

  beforeEach(() => {
    logger = new AuditLogger();
    telemetry = new TelemetryEngine();

    // Populate events for Project A
    logger.record({
      event: { id: "evt_a1", projectId: "proj_tenant_a", type: "task.created" },
      actor: "user",
      action: "task.create",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      reasonCode: "TASK_INIT",
    });

    // Populate events for Project B
    logger.record({
      event: { id: "evt_b1", projectId: "proj_tenant_b", type: "task.created" },
      actor: "user",
      action: "task.create",
      classification: "INFORMATIONAL",
      decision: "PERMIT",
      reasonCode: "TASK_INIT",
    });

    telemetry.incrementCounter("requests", 1, { projectId: "proj_tenant_a" });
    telemetry.incrementCounter("requests", 5, { projectId: "proj_tenant_b" });
  });

  it("strictly partitions audit queries by projectId", () => {
    const recordsA = logger.query({ projectId: "proj_tenant_a" });
    expect(recordsA.length).toBe(1);
    expect(recordsA[0]!.projectId).toBe("proj_tenant_a");

    const recordsB = logger.query({ projectId: "proj_tenant_b" });
    expect(recordsB.length).toBe(1);
    expect(recordsB[0]!.projectId).toBe("proj_tenant_b");
  });

  it("strictly partitions telemetry metrics by projectId", () => {
    const metricsA = telemetry.getMetricSummaries("proj_tenant_a");
    expect(metricsA[0]!.count).toBe(1);

    const metricsB = telemetry.getMetricSummaries("proj_tenant_b");
    expect(metricsB[0]!.count).toBe(1);
    expect(metricsB[0]!.lastValue).toBe(5);
  });
});
