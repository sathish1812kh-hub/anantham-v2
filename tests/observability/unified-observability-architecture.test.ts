import { describe, it, expect } from "vitest";
import { MetricCollector } from "../../src/observability/metric-collector.js";

describe("PRD-OBS-001: Unified Observability Architecture", () => {
  const collector = new MetricCollector();

  it("records counters, gauges, histograms, and traces spans", () => {
    collector.incrementCounter("tool_executions_total", 1, { tool: "view_file" });
    collector.recordGauge("active_processes", 3);
    collector.recordHistogram("execution_duration_ms", 125, { status: "success" });

    const metrics = collector.getMetrics();
    expect(metrics.length).toBe(3);
    expect(metrics[0].name).toBe("tool_executions_total");
    expect(metrics[1].value).toBe(3);

    // Tracing spans
    const span = collector.startSpan("executeTool", "trace_100", undefined, { tool: "run_command" });
    collector.finishSpan(span, "ok");

    expect(span.durationMs).toBeDefined();
    expect(span.status).toBe("ok");
    expect(collector.getSpans().length).toBe(1);
  });
});
