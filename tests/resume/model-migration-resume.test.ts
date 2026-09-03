import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { ModelRouter } from "../../src/models/model-router.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import { ProviderHealthTracker } from "../../src/models/provider-health-tracker.js";
import { ModelMigrationManager } from "../../src/resume/model-migration-manager.js";

describe("PRD-RESUME-003: Model Migration on Resume", () => {
  const testDir = join(process.cwd(), ".test_model_migration_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let sessionRepo: SessionRepository;
  let eventStore: EventStore;
  let modelRouter: ModelRouter;
  let healthTracker: ProviderHealthTracker;
  let migrationManager: ModelMigrationManager;

  const projectId = "prj_mm_01";
  const sessionId = "sess_mm_01";

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    engine = new SqliteEngine({ path: dbPath });
    engine.open();

    const migrationEngine = new MigrationEngine(engine);
    migrationEngine.migrate();

    const now = new Date().toISOString();
    engine.raw.prepare(`
      INSERT INTO projects (id, name, root_path, status, tags_json, model_profile, memory_namespace, orchestration_profile, trust_profile, created_at, last_opened_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(projectId, "Migration Project", "/tmp/mm", "active", "[]", "claude-3-5-sonnet", "mem", "orch", "developer", now, now, now);

    sessionRepo = new SessionRepository(engine);
    sessionRepo.save({
      id: sessionId,
      projectId,
      name: "Resume Session",
      branch: "main",
      status: "active",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default",
      mode: "autonomous",
      permissions: { allowShell: true },
      createdAt: now,
      updatedAt: now,
    });

    eventStore = new EventStore(engine);
    healthTracker = new ProviderHealthTracker();
    modelRouter = new ModelRouter({ healthTracker });

    const adapter = new MockProviderAdapter();

    // Register Candidate 1: Claude 3.5 Sonnet (Original)
    modelRouter.registerCandidate(
      {
        providerId: "anthropic",
        modelId: "claude-3-5-sonnet",
        maxSensitivity: "secret",
        priority: 10,
        profile: {
          modelId: "claude-3-5-sonnet",
          providerId: "anthropic",
          inputs: { textInput: true, imageInput: true, audioInput: false, videoInput: false, documentInput: true },
          outputs: { textOutput: true, imageOutput: false, audioOutput: false, videoOutput: false },
          features: { toolCalling: true, parallelToolCalls: true, structuredOutput: true, jsonSchema: true, streaming: true, reasoning: false, computerUse: false, webSearch: false, codeExecution: false, promptCaching: true },
          limits: { contextWindow: 200_000, maxOutputTokens: 8192 },
          status: "valid",
        },
      },
      adapter
    );

    // Register Candidate 2: GPT-4o (Substitute)
    modelRouter.registerCandidate(
      {
        providerId: "openai",
        modelId: "gpt-4o",
        maxSensitivity: "secret",
        priority: 8,
        profile: {
          modelId: "gpt-4o",
          providerId: "openai",
          inputs: { textInput: true, imageInput: true, audioInput: false, videoInput: false, documentInput: true },
          outputs: { textOutput: true, imageOutput: false, audioOutput: false, videoOutput: false },
          features: { toolCalling: true, parallelToolCalls: true, structuredOutput: true, jsonSchema: true, streaming: true, reasoning: false, computerUse: false, webSearch: false, codeExecution: false, promptCaching: true },
          limits: { contextWindow: 128_000, maxOutputTokens: 4096 },
          status: "valid",
        },
      },
      adapter
    );

    // Register Candidate 3: DeepSeek V3 (Text only, smaller context)
    modelRouter.registerCandidate(
      {
        providerId: "deepseek",
        modelId: "deepseek-v3",
        maxSensitivity: "secret",
        priority: 5,
        profile: {
          modelId: "deepseek-v3",
          providerId: "deepseek",
          inputs: { textInput: true, imageInput: false, audioInput: false, videoInput: false, documentInput: false },
          outputs: { textOutput: true, imageOutput: false, audioOutput: false, videoOutput: false },
          features: { toolCalling: true, parallelToolCalls: true, structuredOutput: true, jsonSchema: true, streaming: true, reasoning: false, computerUse: false, webSearch: false, codeExecution: false, promptCaching: false },
          limits: { contextWindow: 64_000, maxOutputTokens: 4096 },
          status: "valid",
        },
      },
      adapter
    );

    migrationManager = new ModelMigrationManager({
      sessionRepo,
      eventStore,
      modelRouter,
      providerHealthTracker: healthTracker,
    });
  });

  afterEach(() => {
    if (engine.isOpen()) {
      engine.close();
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("handles explicit user model override during resume", async () => {
    const session = sessionRepo.findById(sessionId)!;
    const res = await migrationManager.resolveAndMigrateOnResume(session, {
      overrideModelProfile: "gpt-4o",
    });

    expect(res.migrated).toBe(true);
    expect(res.activeModelProfile).toBe("gpt-4o");
    expect(res.migrationResult?.reason).toBe("USER_OVERRIDE");

    const updatedSession = sessionRepo.findById(sessionId)!;
    expect(updatedSession.modelProfile).toBe("gpt-4o");

    const events = eventStore.getEventsBySession(sessionId);
    expect(events.some((e) => e.type === "model.migrated")).toBe(true);
  });

  it("auto-migrates when original provider experiences an outage", async () => {
    // Simulate Anthropic outage
    healthTracker.recordFailure("anthropic", "claude-3-5-sonnet", new Error("503 Service Unavailable"));
    healthTracker.recordFailure("anthropic", "claude-3-5-sonnet", new Error("503 Service Unavailable"));
    healthTracker.recordFailure("anthropic", "claude-3-5-sonnet", new Error("503 Service Unavailable"));
    healthTracker.recordFailure("anthropic", "claude-3-5-sonnet", new Error("503 Service Unavailable"));
    healthTracker.recordFailure("anthropic", "claude-3-5-sonnet", new Error("503 Service Unavailable"));

    const session = sessionRepo.findById(sessionId)!;
    const res = await migrationManager.resolveAndMigrateOnResume(session);

    expect(res.migrated).toBe(true);
    expect(res.activeModelProfile).toBe("gpt-4o");
    expect(res.migrationResult?.reason).toBe("PROVIDER_UNAVAILABLE");
  });

  it("detects context window downgrade and flags required compaction", async () => {
    const session = sessionRepo.findById(sessionId)!;
    // Estimated tokens: 80,000 (exceeds deepseek 64,000)
    const evaluation = migrationManager.evaluateMigration(session, "deepseek-v3", "USER_OVERRIDE", 80_000);

    expect(evaluation.canMigrate).toBe(true);
    expect(evaluation.contextWindowDelta.requiresCompaction).toBe(true);
    expect(evaluation.modalityDelta.lostModalities).toContain("vision");
    expect(evaluation.modalityDelta.requiresFallbackRepresentation).toBe(true);
  });
});
