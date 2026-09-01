import { describe, it, expect, beforeEach } from "vitest";
import { TelemetryEngine } from "../../src/observability/telemetry-engine.js";

describe("P8.5 Observability — Telemetry Metrics & Spans", () => {
  let telemetry: TelemetryEngine;

  beforeEach(() => {
    telemetry = new TelemetryEngine();
  });

  it("records counters, gauges, and calculates histogram summaries", () => {
    // Record histogram observations (latencies)
    telemetry.recordHistogram("tool.duration", 100, { projectId: "proj_telem" });
    telemetry.recordHistogram("tool.duration", 200, { projectId: "proj_telem" });
    telemetry.recordHistogram("tool.duration", 300, { projectId: "proj_telem" });

    // Record counter
    telemetry.incrementCounter("tasks.completed", 1, { projectId: "proj_telem" });
    telemetry.incrementCounter("tasks.completed", 2, { projectId: "proj_telem" });

    const summaries = telemetry.getMetricSummaries("proj_telem");
    expect(summaries.length).toBe(2);

    const hist = summaries.find((s) => s.name === "tool.duration");
    expect(hist).toBeDefined();
    expect(hist?.min).toBe(100);
    expect(hist?.max).toBe(300);
    expect(hist?.avg).toBe(200);
    expect(hist?.count).toBe(3);

    const counter = summaries.find((s) => s.name === "tasks.completed");
    expect(counter).toBeDefined();
    expect(counter?.count).toBe(2);
  });

  it("creates, measures, and closes execution spans", async () => {
    const spanId = telemetry.startSpan("workflow.node_execute", {
      projectId: "proj_span",
      attributes: { node: "step_1" },
    });

    await new Promise((r) => setTimeout(r, 20));

    const completed = telemetry.endSpan(spanId, {
      status: "OK",
      attributes: { output: "success" },
    });

    expect(completed).toBeDefined();
    expect(completed?.durationMs).toBeGreaterThanOrEqual(15);
    expect(completed?.status).toBe("OK");
    expect(completed?.attributes.node).toBe("step_1");
  });
});
