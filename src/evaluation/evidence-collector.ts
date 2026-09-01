import { type HarnessEvent } from "../domain/event.js";

export interface CollectedEvidence {
  events: HarnessEvent[];
  stateSnapshots: Record<string, unknown>;
  policyDecisions: string[];
  artifacts: Array<{ id: string; path: string; hash?: string }>;
  metrics: Record<string, number>;
}

/**
 * Evidence Collector.
 * Gathers objective, machine-verifiable runtime evidence during benchmark execution.
 */
export class EvidenceCollector {
  private readonly events: HarnessEvent[] = [];
  private readonly stateSnapshots: Record<string, unknown> = {};
  private readonly policyDecisions: string[] = [];
  private readonly artifacts: Array<{ id: string; path: string; hash?: string }> = [];
  private readonly metrics: Record<string, number> = {};

  public recordEvent(event: HarnessEvent): void {
    this.events.push(event);
  }

  public recordState(key: string, value: unknown): void {
    this.stateSnapshots[key] = value;
  }

  public recordPolicyDecision(decision: string): void {
    this.policyDecisions.push(decision);
  }

  public recordArtifact(artifact: { id: string; path: string; hash?: string }): void {
    this.artifacts.push(artifact);
  }

  public recordMetric(name: string, value: number): void {
    this.metrics[name] = value;
  }

  public getEvidence(): CollectedEvidence {
    return {
      events: [...this.events],
      stateSnapshots: { ...this.stateSnapshots },
      policyDecisions: [...this.policyDecisions],
      artifacts: [...this.artifacts],
      metrics: { ...this.metrics },
    };
  }

  public clear(): void {
    this.events.length = 0;
    this.policyDecisions.length = 0;
    this.artifacts.length = 0;
    for (const k of Object.keys(this.stateSnapshots)) {
      delete this.stateSnapshots[k];
    }
    for (const k of Object.keys(this.metrics)) {
      delete this.metrics[k];
    }
  }
}
