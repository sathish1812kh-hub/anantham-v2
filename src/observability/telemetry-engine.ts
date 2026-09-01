import { randomUUID } from "node:crypto";
import {
  type TelemetryMetric,
  type TelemetrySpan,
  TelemetryMetricSchema,
  TelemetrySpanSchema,
} from "../domain/observability.js";

export interface MetricSummary {
  name: string;
  type: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  p95: number;
  lastValue: number;
  unit: string;
}

/**
 * Structured Telemetry & Metrics Engine.
 * PRD Part 2 Section 270.
 */
export class TelemetryEngine {
  private readonly metrics: TelemetryMetric[] = [];
  private readonly activeSpans = new Map<string, { span: TelemetrySpan; startMs: number }>();
  private readonly completedSpans: TelemetrySpan[] = [];

  /**
   * Increment a counter metric.
   */
  public incrementCounter(
    name: string,
    value: number = 1,
    options?: { projectId?: string; sessionId?: string; tags?: Record<string, string>; unit?: string }
  ): TelemetryMetric {
    const metric: TelemetryMetric = TelemetryMetricSchema.parse({
      name,
      type: "COUNTER",
      value,
      unit: options?.unit ?? "count",
      timestamp: new Date().toISOString(),
      projectId: options?.projectId,
      sessionId: options?.sessionId,
      tags: options?.tags ?? {},
    });
    this.metrics.push(metric);
    return metric;
  }

  /**
   * Set a gauge metric.
   */
  public setGauge(
    name: string,
    value: number,
    options?: { projectId?: string; sessionId?: string; tags?: Record<string, string>; unit?: string }
  ): TelemetryMetric {
    const metric: TelemetryMetric = TelemetryMetricSchema.parse({
      name,
      type: "GAUGE",
      value,
      unit: options?.unit ?? "value",
      timestamp: new Date().toISOString(),
      projectId: options?.projectId,
      sessionId: options?.sessionId,
      tags: options?.tags ?? {},
    });
    this.metrics.push(metric);
    return metric;
  }

  /**
   * Record a histogram observation (latency, duration, tokens).
   */
  public recordHistogram(
    name: string,
    value: number,
    options?: { projectId?: string; sessionId?: string; tags?: Record<string, string>; unit?: string }
  ): TelemetryMetric {
    const metric: TelemetryMetric = TelemetryMetricSchema.parse({
      name,
      type: "HISTOGRAM",
      value,
      unit: options?.unit ?? "ms",
      timestamp: new Date().toISOString(),
      projectId: options?.projectId,
      sessionId: options?.sessionId,
      tags: options?.tags ?? {},
    });
    this.metrics.push(metric);
    return metric;
  }

  /**
   * Start an execution span for tracing.
   */
  public startSpan(
    name: string,
    options?: { traceId?: string; parentSpanId?: string; projectId?: string; sessionId?: string; attributes?: Record<string, unknown> }
  ): string {
    const spanId = `span_${randomUUID().slice(0, 8)}`;
    const span: TelemetrySpan = TelemetrySpanSchema.parse({
      spanId,
      traceId: options?.traceId ?? `trace_${randomUUID().slice(0, 8)}`,
      parentSpanId: options?.parentSpanId,
      name,
      startTime: new Date().toISOString(),
      projectId: options?.projectId,
      sessionId: options?.sessionId,
      status: "OK",
      attributes: options?.attributes ?? {},
    });

    this.activeSpans.set(spanId, { span, startMs: Date.now() });
    return spanId;
  }

  /**
   * End an active execution span.
   */
  public endSpan(
    spanId: string,
    options?: { status?: "OK" | "ERROR" | "CANCELLED"; attributes?: Record<string, unknown> }
  ): TelemetrySpan | null {
    const entry = this.activeSpans.get(spanId);
    if (!entry) return null;

    this.activeSpans.delete(spanId);
    const durationMs = Date.now() - entry.startMs;
    const now = new Date().toISOString();

    const completed: TelemetrySpan = TelemetrySpanSchema.parse({
      ...entry.span,
      endTime: now,
      durationMs,
      status: options?.status ?? "OK",
      attributes: {
        ...entry.span.attributes,
        ...(options?.attributes ?? {}),
      },
    });

    this.completedSpans.push(completed);
    this.recordHistogram(`${completed.name}.duration_ms`, durationMs, {
      projectId: completed.projectId,
      sessionId: completed.sessionId,
    });

    return completed;
  }

  /**
   * Get aggregated metric summaries.
   */
  public getMetricSummaries(projectId?: string): MetricSummary[] {
    const filtered = projectId ? this.metrics.filter((m) => m.projectId === projectId) : this.metrics;
    const groups = new Map<string, TelemetryMetric[]>();

    for (const m of filtered) {
      const list = groups.get(m.name) ?? [];
      list.push(m);
      groups.set(m.name, list);
    }

    const summaries: MetricSummary[] = [];
    for (const [name, list] of groups.entries()) {
      const values = list.map((m) => m.value).sort((a, b) => a - b);
      const count = values.length;
      const min = values[0]!;
      const max = values[count - 1]!;
      const sum = values.reduce((acc, v) => acc + v, 0);
      const avg = Math.round((sum / count) * 100) / 100;
      const p95Index = Math.min(Math.floor(count * 0.95), count - 1);
      const p95 = values[p95Index]!;
      const lastValue = list[count - 1]!.value;
      const unit = list[0]!.unit;
      const type = list[0]!.type;

      summaries.push({
        name,
        type,
        count,
        min,
        max,
        avg,
        p95,
        lastValue,
        unit,
      });
    }

    return summaries;
  }

  public getSpans(traceId?: string): TelemetrySpan[] {
    if (traceId) {
      return this.completedSpans.filter((s) => s.traceId === traceId);
    }
    return [...this.completedSpans];
  }
}
