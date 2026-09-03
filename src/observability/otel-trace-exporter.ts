/**
 * OpenTelemetry (OTel) Integration & Trace Exporter
 * PRD-PART2-310: OpenTelemetry (OTel) Integration & Trace Exporter
 */

import type { TraceSpan } from "./metric-collector.js";

export interface OtelResourceSpan {
  resource: {
    attributes: Array<{ key: string; value: { stringValue: string } }>;
  };
  scopeSpans: Array<{
    scope: { name: string; version: string };
    spans: Array<{
      traceId: string;
      spanId: string;
      parentSpanId?: string;
      name: string;
      kind: number; // 1 = INTERNAL
      startTimeUnixNano: string;
      endTimeUnixNano: string;
      status: { code: number };
      attributes: Array<{ key: string; value: { stringValue?: string; intValue?: number } }>;
    }>;
  }>;
}

export class OtelTraceExporter {
  private serviceName: string;
  private serviceVersion: string;

  constructor(serviceName = "anantham-orchestrator", serviceVersion = "2.0.0") {
    this.serviceName = serviceName;
    this.serviceVersion = serviceVersion;
  }

  public exportOtlpJson(spans: TraceSpan[]): { resourceSpans: OtelResourceSpan[] } {
    const otelSpans = spans.map((s) => ({
      traceId: s.traceId,
      spanId: s.spanId,
      parentSpanId: s.parentSpanId,
      name: s.name,
      kind: 1, // SPAN_KIND_INTERNAL
      startTimeUnixNano: `${s.startTime * 1_000_000}`,
      endTimeUnixNano: `${(s.endTime ?? s.startTime) * 1_000_000}`,
      status: { code: s.status === "ok" ? 1 : 2 },
      attributes: Object.entries(s.attributes).map(([k, v]) => ({
        key: k,
        value: typeof v === "number" ? { intValue: v } : { stringValue: String(v) },
      })),
    }));

    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: this.serviceName } },
              { key: "service.version", value: { stringValue: this.serviceVersion } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "anantham.tracer", version: this.serviceVersion },
              spans: otelSpans,
            },
          ],
        },
      ],
    };
  }
}
