import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { MemoryRepository } from "../../src/persistence/repositories/memory-repository.js";
import { EventStore } from "../../src/event-state/event-store.js";
import { UniversalContentSearchEngine } from "../../src/search/universal-content-search-engine.js";

describe("PRD-SRCH-001: Universal Content Search & Cross-Modality Query", () => {
  const testDir = join(process.cwd(), ".test_search_engine_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let memoryRepo: MemoryRepository;
  let eventStore: EventStore;
  let searchEngine: UniversalContentSearchEngine;

  const projectId = "prj_search_01";
  const sessionId = "sess_search_01";

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
    `).run(projectId, "Search Project", "/tmp/search", "active", "[]", "default", "mem", "orch", "developer", now, now, now);

    engine.raw.prepare(`
      INSERT INTO sessions (id, project_id, name, branch, status, model_profile, key_pool_profile, mode, permissions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(sessionId, projectId, "Search Session", "main", "active", "default", "default", "autonomous", "{}", now, now);

    memoryRepo = new MemoryRepository(engine);
    eventStore = new EventStore(engine);

    // 1. Seed Memory Items
    memoryRepo.save({
      id: "mem_auth_01",
      scope: "project",
      projectId,
      sessionId,
      type: "architecture_rule",
      content: "All GraphQL endpoints must enforce OAuth2 Bearer token authentication.",
      confidence: 0.95,
      priority: "CRITICAL",
      sourceEventIds: ["evt_01"],
      createdAt: now,
      sensitivity: "normal",
      tags: ["auth", "graphql", "security"],
    });

    memoryRepo.save({
      id: "mem_secret_01",
      scope: "project",
      projectId,
      sessionId,
      type: "credential_note",
      content: "Root admin signing private key stored in Vault under secret/oauth/private_key.",
      confidence: 1.0,
      priority: "CRITICAL",
      sourceEventIds: ["evt_02"],
      createdAt: now,
      sensitivity: "secret",
      tags: ["vault", "secret"],
    });

    // 2. Seed Events
    eventStore.append({
      id: "evt_oauth_deployed",
      schemaVersion: 1,
      projectId,
      sessionId,
      type: "deployment.completed",
      actor: "system",
      timestamp: now,
      payload: {
        service: "oauth2_auth_gateway",
        version: "v2.4.1",
        status: "success",
      },
    });

    // 3. Seed Artifacts
    engine.raw.prepare(`
      INSERT INTO artifacts (id, type, project_id, session_id, task_id, agent_id, content_uri, preview_uri, sha256, source_event_ids_json, verification_json, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(
      "art_oauth_spec",
      "document",
      projectId,
      sessionId,
      null,
      null,
      "docs/architecture/oauth2-flow.md",
      null,
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      JSON.stringify(["evt_01"]),
      null,
      now,
      JSON.stringify({ title: "OAuth2 Architecture Specification", tags: ["oauth", "security", "spec"] })
    );

    searchEngine = new UniversalContentSearchEngine({
      engine,
      eventStore,
      memoryRepo,
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

  it("performs unified cross-modality search finding memories, events, and artifacts", async () => {
    const res = await searchEngine.search({
      query: "OAuth2",
      projectId,
    });

    expect(res.totalHits).toBeGreaterThanOrEqual(3);
    const modalities = new Set(res.results.map((r) => r.modality));
    expect(modalities.has("memory")).toBe(true);
    expect(modalities.has("event")).toBe(true);
    expect(modalities.has("artifact")).toBe(true);
    expect(res.results[0].relevanceScore).toBeGreaterThanOrEqual(0.7);
  });

  it("filters search strictly by requested modalities", async () => {
    const res = await searchEngine.search({
      query: "OAuth2",
      projectId,
      modalities: ["artifact"],
    });

    expect(res.totalHits).toBe(1);
    expect(res.results[0].modality).toBe("artifact");
    expect(res.results[0].id).toBe("art_oauth_spec");
  });

  it("enforces sensitivity cap ceiling to prevent data leakage", async () => {
    const resNormal = await searchEngine.search({
      query: "private key",
      projectId,
      sensitivityCap: "normal",
    });

    expect(resNormal.results.some((r) => r.id === "mem_secret_01")).toBe(false);

    const resSecret = await searchEngine.search({
      query: "private key",
      projectId,
      sensitivityCap: "secret",
    });

    expect(resSecret.results.some((r) => r.id === "mem_secret_01")).toBe(true);
  });

  it("supports pagination with limit and offset", async () => {
    const resPage1 = await searchEngine.search({
      query: "OAuth2",
      projectId,
      limit: 1,
      offset: 0,
    });

    expect(resPage1.results.length).toBe(1);

    const resPage2 = await searchEngine.search({
      query: "OAuth2",
      projectId,
      limit: 1,
      offset: 1,
    });

    expect(resPage2.results.length).toBe(1);
    expect(resPage1.results[0].id).not.toBe(resPage2.results[0].id);
  });
});
