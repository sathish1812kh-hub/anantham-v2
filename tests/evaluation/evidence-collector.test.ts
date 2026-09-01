import { describe, it, expect, beforeEach } from "vitest";
import { EvidenceCollector } from "../../src/evaluation/evidence-collector.js";

describe("P9.1 Evaluation — Evidence Collector", () => {
  let collector: EvidenceCollector;

  beforeEach(() => {
    collector = new EvidenceCollector();
  });

  it("gathers events, snapshots, decisions, artifacts, and metrics", () => {
    collector.recordEvent({
      id: "evt_10",
      schemaVersion: 1,
      type: "session.started",
      actor: "user",
      timestamp: new Date().toISOString(),
      payload: {},
    });

    collector.recordState("task.status", "completed");
    collector.recordPolicyDecision("DENY");
    collector.recordArtifact({ id: "art_10", path: "/tmp/report.md", hash: "abc1234" });
    collector.recordMetric("duration_ms", 350);

    const evidence = collector.getEvidence();
    expect(evidence.events.length).toBe(1);
    expect(evidence.stateSnapshots["task.status"]).toBe("completed");
    expect(evidence.policyDecisions).toContain("DENY");
    expect(evidence.artifacts[0]!.hash).toBe("abc1234");
    expect(evidence.metrics["duration_ms"]).toBe(350);

    collector.clear();
    const cleared = collector.getEvidence();
    expect(cleared.events.length).toBe(0);
    expect(Object.keys(cleared.stateSnapshots).length).toBe(0);
  });
});
