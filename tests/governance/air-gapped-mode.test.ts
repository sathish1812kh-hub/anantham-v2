import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { EventStore } from "../../src/event-state/event-store.js";
import {
  AirGappedPolicyEnforcer,
  AirGappedViolationError,
} from "../../src/governance/air-gapped-policy-enforcer.js";

describe("PRD-GOV-002: Air-Gapped & Offline Operating Mode", () => {
  const testDir = join(process.cwd(), ".test_air_gapped_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let eventStore: EventStore;

  const projectId = "prj_airgap_01";
  const sessionId = "sess_airgap_01";

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
    `).run(projectId, "AirGap Project", "/tmp/airgap", "active", "[]", "default", "mem", "orch", "developer", now, now, now);

    engine.raw.prepare(`
      INSERT INTO sessions (id, project_id, name, branch, status, model_profile, key_pool_profile, mode, permissions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(sessionId, projectId, "AirGap Session", "main", "active", "default", "default", "autonomous", "{}", now, now);

    eventStore = new EventStore(engine);
  });

  afterEach(() => {
    if (engine.isOpen()) {
      engine.close();
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("allows all egress under ONLINE mode", () => {
    const enforcer = new AirGappedPolicyEnforcer({
      eventStore,
      config: { mode: "ONLINE" },
    });

    const decision = enforcer.evaluateEgress({
      targetUrl: "https://api.openai.com/v1/chat/completions",
      projectId,
      sessionId,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.ruleMatched).toBe("DEFAULT_ALLOW_ONLINE");
    expect(() => enforcer.assertEgressAllowed({ targetUrl: "https://api.github.com" })).not.toThrow();
  });

  it("blocks external network egress under AIR_GAPPED_ISOLATED mode while allowing localhost", () => {
    const enforcer = new AirGappedPolicyEnforcer({
      eventStore,
      config: {
        mode: "AIR_GAPPED_ISOLATED",
        allowLocalhost: true,
      },
    });

    // Localhost allowed
    const localDec = enforcer.evaluateEgress({
      targetUrl: "http://localhost:11434/api/generate",
      projectId,
      sessionId,
    });
    expect(localDec.allowed).toBe(true);
    expect(localDec.ruleMatched).toBe("ALLOW_LOCALHOST_ONLY");

    // External blocked
    const externalDec = enforcer.evaluateEgress({
      targetUrl: "https://api.anthropic.com/v1/messages",
      projectId,
      sessionId,
      toolName: "web_search",
    });
    expect(externalDec.allowed).toBe(false);
    expect(externalDec.ruleMatched).toBe("BLOCK_ALL_EXTERNAL_EGRESS");

    // Assert throws AirGappedViolationError
    expect(() =>
      enforcer.assertEgressAllowed({
        targetUrl: "https://api.anthropic.com/v1/messages",
        projectId,
        sessionId,
      })
    ).toThrow(AirGappedViolationError);

    // Block event recorded in store
    const events = eventStore.getEventsBySession(sessionId);
    expect(events.some((e) => e.type === "governance.egress_blocked")).toBe(true);
  });

  it("enforces domain allowlisting under RESTRICTED_EGRESS mode", () => {
    const enforcer = new AirGappedPolicyEnforcer({
      eventStore,
      config: {
        mode: "RESTRICTED_EGRESS",
        allowedEgressDomains: ["*.internal.corp", "api.github.com"],
        allowLocalhost: true,
      },
    });

    // Approved wildcard domain
    const internalDec = enforcer.evaluateEgress({
      targetUrl: "https://jira.internal.corp/rest/api/2",
    });
    expect(internalDec.allowed).toBe(true);
    expect(internalDec.ruleMatched).toBe("ALLOWLISTED_EGRESS_DOMAIN");

    // Approved exact domain
    const githubDec = enforcer.evaluateEgress({
      targetUrl: "https://api.github.com/repos/org/repo",
    });
    expect(githubDec.allowed).toBe(true);

    // Unapproved domain blocked
    const badDec = enforcer.evaluateEgress({
      targetUrl: "https://untrusted-external-site.com",
    });
    expect(badDec.allowed).toBe(false);
    expect(badDec.ruleMatched).toBe("UNLISTED_EGRESS_DOMAIN");
  });

  it("strictly prevents wildcard domain suffix collisions and validates boundary isolation", () => {
    const enforcer = new AirGappedPolicyEnforcer({
      eventStore,
      config: {
        mode: "RESTRICTED_EGRESS",
        allowedEgressDomains: ["*.internal.corp"],
        allowLocalhost: false,
      },
    });

    // sub.internal.corp is ALLOWED under *.internal.corp
    const subDec = enforcer.evaluateEgress({
      targetUrl: "https://sub.internal.corp/data",
    });
    expect(subDec.allowed).toBe(true);
    expect(subDec.ruleMatched).toBe("ALLOWLISTED_EGRESS_DOMAIN");

    // internal.corp is ALLOWED under *.internal.corp
    const rootDec = enforcer.evaluateEgress({
      targetUrl: "https://internal.corp/api",
    });
    expect(rootDec.allowed).toBe(true);
    expect(rootDec.ruleMatched).toBe("ALLOWLISTED_EGRESS_DOMAIN");

    // evil-internal.corp is BLOCKED under *.internal.corp (suffix collision attack)
    const evilDec = enforcer.evaluateEgress({
      targetUrl: "https://evil-internal.corp/exfiltrate",
    });
    expect(evilDec.allowed).toBe(false);
    expect(evilDec.ruleMatched).toBe("UNLISTED_EGRESS_DOMAIN");

    // notinternal.corp is BLOCKED under *.internal.corp
    const notInternalDec = enforcer.evaluateEgress({
      targetUrl: "https://notinternal.corp/steal",
    });
    expect(notInternalDec.allowed).toBe(false);
    expect(notInternalDec.ruleMatched).toBe("UNLISTED_EGRESS_DOMAIN");
  });

  it("intercepts model requests and redirects to local endpoint or blocks", () => {
    const enforcer = new AirGappedPolicyEnforcer({
      config: {
        mode: "AIR_GAPPED_ISOLATED",
        blockExternalModelEndpoints: true,
        localModelEndpoint: "http://localhost:11434/v1",
      },
    });

    const redirectRes = enforcer.interceptModelRequest("https://api.openai.com/v1", "openai");
    expect(redirectRes.allowed).toBe(true);
    expect(redirectRes.redirectUrl).toBe("http://localhost:11434/v1");

    // If local endpoint is missing, it should strictly block
    enforcer.updateConfig({ localModelEndpoint: undefined });
    const blockRes = enforcer.interceptModelRequest("https://api.openai.com/v1", "openai");
    expect(blockRes.allowed).toBe(false);
    expect(blockRes.violationReason).toContain("blocked by air-gapped policy");
  });

  it("intercepts forbidden network tools under offline mode", () => {
    const enforcer = new AirGappedPolicyEnforcer({
      config: { mode: "STRICT_OFFLINE" },
    });

    const toolRes = enforcer.interceptToolExecution("web_search");
    expect(toolRes.allowed).toBe(false);
    expect(toolRes.violationReason).toContain("Network tool web_search is forbidden");

    // Local tool execution allowed
    const localToolRes = enforcer.interceptToolExecution("file_reader");
    expect(localToolRes.allowed).toBe(true);
  });
});
