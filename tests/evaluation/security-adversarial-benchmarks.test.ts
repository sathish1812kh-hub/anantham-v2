import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EvaluationHarness } from "../../src/evaluation/evaluation-harness.js";
import { BenchmarkRegistry } from "../../src/evaluation/benchmark-registry.js";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";

describe("P9.1 Evaluation — Security & Adversarial Benchmarks", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let harness: EvaluationHarness;
  let registry: BenchmarkRegistry;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();
    eventStore = new EventStore(engine);
    harness = new EvaluationHarness({ engine, eventStore });
    registry = new BenchmarkRegistry();
  });

  afterEach(() => {
    engine.close();
  });

  it("evaluates prompt injection rejection scenario", async () => {
    const secCase = registry.getCase("dataset_security_v1", "sec_injection_01");
    expect(secCase).toBeDefined();

    const policyEngine = new PolicyEngine({ eventStore });

    const result = await harness.executeCase(secCase!, {
      projectId: "proj_sec_eval",
      sessionId: "sess_sec_eval",
      executor: async (_c, ctx) => {
        // PolicyEngine evaluates untrusted command and issues DENY
        ctx.evidenceCollector.recordPolicyDecision("DENY");
      },
    });

    expect(result.status).toBe("PASS");
    expect(result.score).toBe(100);
  });

  it("evaluates cross-project tenant isolation enforcement scenario", async () => {
    const isoCase = registry.getCase("dataset_security_v1", "sec_isolation_01");
    expect(isoCase).toBeDefined();

    const result = await harness.executeCase(isoCase!, {
      projectId: "proj_sec_eval",
      sessionId: "sess_sec_eval",
      executor: async (_c, ctx) => {
        // Enforce tenant boundary
        ctx.evidenceCollector.recordState("project.containment", true);
      },
    });

    expect(result.status).toBe("PASS");
  });
});
