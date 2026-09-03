import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { MemoryRepository } from "../../src/persistence/repositories/memory-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { MemoryDecayEngine } from "../../src/memory/memory-decay-engine.js";
import type { MemoryItem } from "../../src/domain/memory.js";

describe("PRD-MEM-003: Memory Decay, TTL & Access Frequency Pruning", () => {
  const testDir = join(process.cwd(), ".test_memory_decay_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let memoryRepo: MemoryRepository;
  let eventStore: EventStore;
  let decayEngine: MemoryDecayEngine;

  const projectId = "prj_decay_01";

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
    `).run(projectId, "Memory Decay Project", "/tmp/decay", "active", "[]", "default", "mem", "orch", "developer", now, now, now);

    memoryRepo = new MemoryRepository(engine);
    eventStore = new EventStore(engine);

    decayEngine = new MemoryDecayEngine({
      memoryRepo,
      eventStore,
      config: {
        halfLifeDays: 30,
        accessBoostFactor: 0.05,
        maxAccessBoost: 0.50,
        criticalPriorityFloor: 0.80,
        highPriorityFloor: 0.40,
        staleThresholdScore: 0.20,
        pruneThresholdScore: 0.10,
      },
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

  it("calculates exponential decay and enforces priority floors", () => {
    const baseNow = Date.now();
    const thirtyDaysAgo = new Date(baseNow - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(baseNow - 60 * 24 * 60 * 60 * 1000).toISOString();

    const normalItem: MemoryItem = {
      id: "mem_normal_30d",
      scope: "project",
      projectId,
      type: "fact",
      content: "Port number is 8080",
      confidence: 1.0,
      priority: "NORMAL",
      sourceEventIds: ["evt_01"],
      createdAt: thirtyDaysAgo,
      sensitivity: "normal",
    };

    // After 30 days (1 half life), confidence 1.0 should decay to ~0.50
    const score30 = decayEngine.computeDecayedScore(normalItem, baseNow, 0);
    expect(score30).toBeCloseTo(0.50, 1);

    // After 60 days (2 half lives), confidence 1.0 should decay to ~0.25
    normalItem.createdAt = sixtyDaysAgo;
    const score60 = decayEngine.computeDecayedScore(normalItem, baseNow, 0);
    expect(score60).toBeCloseTo(0.25, 1);

    // Critical item should never drop below 0.80 floor
    const criticalItem: MemoryItem = {
      ...normalItem,
      id: "mem_critical_60d",
      priority: "CRITICAL",
    };
    const scoreCrit = decayEngine.computeDecayedScore(criticalItem, baseNow, 0);
    expect(scoreCrit).toBeGreaterThanOrEqual(0.80);
  });

  it("applies access boost when memory is accessed repeatedly", () => {
    const baseNow = Date.now();
    const thirtyDaysAgo = new Date(baseNow - 30 * 24 * 60 * 60 * 1000).toISOString();

    const item: MemoryItem = {
      id: "mem_boosted",
      scope: "project",
      projectId,
      type: "fact",
      content: "Database URL connection string",
      confidence: 0.8,
      priority: "NORMAL",
      sourceEventIds: ["evt_02"],
      createdAt: thirtyDaysAgo,
      sensitivity: "normal",
    };

    // Base score without access: 0.8 * 0.5 = 0.40
    const baseScore = decayEngine.computeDecayedScore(item, baseNow, 0);
    expect(baseScore).toBeCloseTo(0.40, 1);

    // Score with 10 accesses (+50% boost): 0.40 * 1.50 = 0.60
    const boostedScore = decayEngine.computeDecayedScore(item, baseNow, 10);
    expect(boostedScore).toBeCloseTo(0.60, 1);
  });

  it("resolves conflicts favoring higher source authority (user > verified artifact > agent)", () => {
    const now = new Date().toISOString();

    const agentItem: MemoryItem = {
      id: "mem_agent",
      scope: "project",
      projectId,
      type: "fact",
      content: "Auth header format is Token <key>",
      confidence: 0.9,
      priority: "NORMAL",
      sourceEventIds: ["evt_01"],
      createdAt: now,
      sensitivity: "normal",
      metadata: { source: "agent" },
    };

    const userItem: MemoryItem = {
      id: "mem_user",
      scope: "project",
      projectId,
      type: "fact",
      content: "Auth header format is Bearer <key>",
      confidence: 1.0,
      priority: "CRITICAL",
      sourceEventIds: ["evt_02"],
      createdAt: now,
      sensitivity: "normal",
      metadata: { source: "user" },
    };

    const resolution = decayEngine.resolveConflicts(agentItem, userItem);
    expect(resolution.conflictDetected).toBe(true);
    expect(resolution.acceptedItemId).toBe("mem_user");
    expect(resolution.invalidatedItemIds).toContain("mem_agent");
    expect(resolution.unresolved).toBe(false);
  });

  it("prunes expired TTL items and items falling below pruneThresholdScore", async () => {
    const baseNow = Date.now();
    const ninetyDaysAgo = new Date(baseNow - 90 * 24 * 60 * 60 * 1000).toISOString();
    const expiredYesterday = new Date(baseNow - 24 * 60 * 60 * 1000).toISOString();

    // Item 1: Expired by explicit TTL
    memoryRepo.save({
      id: "mem_ttl_exp",
      scope: "project",
      projectId,
      type: "fact",
      content: "Temporary token",
      confidence: 1.0,
      priority: "LOW",
      sourceEventIds: [],
      createdAt: ninetyDaysAgo,
      expiresAt: expiredYesterday,
      sensitivity: "normal",
    });

    // Item 2: Decayed below prune threshold (0.10)
    memoryRepo.save({
      id: "mem_decayed_prune",
      scope: "project",
      projectId,
      type: "fact",
      content: "Old debug log note",
      confidence: 0.3,
      priority: "LOW",
      sourceEventIds: [],
      createdAt: ninetyDaysAgo, // 3 half-lives: 0.3 * 0.125 = 0.0375 < 0.10
      sensitivity: "normal",
    });

    // Item 3: Fresh valid item
    memoryRepo.save({
      id: "mem_fresh_keep",
      scope: "project",
      projectId,
      type: "fact",
      content: "Core architectural invariant",
      confidence: 1.0,
      priority: "CRITICAL",
      sourceEventIds: [],
      createdAt: new Date().toISOString(),
      sensitivity: "normal",
    });

    const pruneResult = await decayEngine.pruneExpiredAndStale({ projectId, now: baseNow });
    expect(pruneResult.scannedCount).toBe(3);
    expect(pruneResult.prunedCount).toBe(2);
    expect(pruneResult.prunedItemIds).toContain("mem_ttl_exp");
    expect(pruneResult.prunedItemIds).toContain("mem_decayed_prune");

    // Fresh item should still exist in database
    expect(memoryRepo.findById("mem_fresh_keep")).not.toBeNull();
    // Pruned items should be deleted
    expect(memoryRepo.findById("mem_ttl_exp")).toBeNull();
    expect(memoryRepo.findById("mem_decayed_prune")).toBeNull();
  });
});
