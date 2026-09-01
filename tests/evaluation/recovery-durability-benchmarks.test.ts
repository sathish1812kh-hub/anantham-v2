import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EvaluationHarness } from "../../src/evaluation/evaluation-harness.js";
import { BenchmarkRegistry } from "../../src/evaluation/benchmark-registry.js";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { LeaseRepository } from "../../src/persistence/repositories/lease-repository.js";
import { CrashRecoveryEngine } from "../../src/recovery/crash-recovery-engine.js";

describe("P9.1 Evaluation — Recovery & Durability Benchmarks", () => {
  let engine: SqliteEngine;
  let eventStore: EventStore;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let recoveryEngine: CrashRecoveryEngine;
  let harness: EvaluationHarness;
  let registry: BenchmarkRegistry;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();
    eventStore = new EventStore(engine);
    taskRepo = new TaskRepository(engine);
    leaseRepo = new LeaseRepository(engine);
    recoveryEngine = new CrashRecoveryEngine({
      engine,
      eventStore,
    });
    harness = new EvaluationHarness({ engine, eventStore });
    registry = new BenchmarkRegistry();
  });

  afterEach(() => {
    engine.close();
  });

  it("evaluates crash recovery and orphan detection scenario", async () => {
    const recCase = registry.getCase("dataset_recovery_v1", "rec_crash_01");
    expect(recCase).toBeDefined();

    const result = await harness.executeCase(recCase!, {
      projectId: "proj_rec_eval",
      sessionId: "sess_rec_eval",
      executor: async (_c, ctx) => {
        // Run recovery and record survived state
        const recResult = await recoveryEngine.executeRecovery();
        ctx.evidenceCollector.recordState("recovery.status", recResult.status === "SUCCESS");
      },
    });


    expect(result.status).toBe("PASS");
    expect(result.score).toBe(100);
  });
});
