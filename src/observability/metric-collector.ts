/**
 * Unified Observability Architecture & Metrics Collector
 * PRD-OBS-001: Unified Observability Architecture
 */

export interface MetricEntry {
  name: string;
  type: "counter" | "gauge" | "histogram";
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: Record<string, unknown>;
  status: "ok" | "error";
}

export class MetricCollector {
  private metrics: MetricEntry[] = [];
  private spans: TraceSpan[] = [];

  public incrementCounter(name: string, delta = 1, labels: Record<string, string> = {}): void {
    this.metrics.push({
      name,
      type: "counter",
      value: delta,
      labels,
      timestamp: Date.now(),
    });
  }

  public recordGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    this.metrics.push({
      name,
      type: "gauge",
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  public recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    this.metrics.push({
      name,
      type: "histogram",
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  public startSpan(name: string, traceId: string, parentSpanId?: string, attributes: Record<string, unknown> = {}): TraceSpan {
    const span: TraceSpan = {
      traceId,
      spanId: `span_${Math.random().toString(36).slice(2, 10)}`,
      parentSpanId,
      name,
      startTime: Date.now(),
      attributes,
      status: "ok",
    };
    this.spans.push(span);
    return span;
  }

  public finishSpan(span: TraceSpan, status: "ok" | "error" = "ok"): void {
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status;
  }

  public getMetrics(): MetricEntry[] {
    return [...this.metrics];
  }

  public getSpans(): TraceSpan[] {
    return [...this.spans];
  }
}
