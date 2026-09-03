import { describe, it, expect } from "vitest";
import { OtelTraceExporter } from "../../src/observability/otel-trace-exporter.js";
import type { TraceSpan } from "../../src/observability/metric-collector.js";

describe("PRD-PART2-310: OpenTelemetry (OTel) Integration & Trace Exporter", () => {
  const exporter = new OtelTraceExporter("anantham-core", "2.0.0");

  it("exports internal spans to W3C / OTLP JSON format with timestamps and resource attributes", () => {
    const spans: TraceSpan[] = [
      {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        name: "dispatchSubagent",
        startTime: 1700000000000,
        endTime: 1700000001500,
        attributes: { "subagent.role": "coder", "tasks.count": 2 },
        status: "ok",
      },
    ];

    const otlp = exporter.exportOtlpJson(spans);
    expect(otlp.resourceSpans.length).toBe(1);

    const rs = otlp.resourceSpans[0]!;
    expect(rs.resource.attributes.some((a) => a.key === "service.name" && a.value.stringValue === "anantham-core")).toBe(true);

    const scopeSpan = rs.scopeSpans[0]!;
    expect(scopeSpan.spans.length).toBe(1);
    expect(scopeSpan.spans[0]!.name).toBe("dispatchSubagent");
    expect(scopeSpan.spans[0]!.kind).toBe(1);
  });
});
