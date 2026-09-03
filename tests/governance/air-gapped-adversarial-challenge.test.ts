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

describe("Adversarial Empirical Challenge: Air-Gapped Policy Enforcer Wildcard & Boundary Isolation", () => {
  const testDir = join(process.cwd(), ".test_air_gapped_adv_" + Date.now());
  const dbPath = join(testDir, "test.sqlite");
  let engine: SqliteEngine;
  let eventStore: EventStore;

  const projectId = "prj_adv_01";
  const sessionId = "sess_adv_01";

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
    `).run(projectId, "Adv Project", "/tmp/adv", "active", "[]", "default", "mem", "orch", "developer", now, now, now);

    engine.raw.prepare(`
      INSERT INTO sessions (id, project_id, name, branch, status, model_profile, key_pool_profile, mode, permissions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(sessionId, projectId, "Adv Session", "main", "active", "default", "default", "autonomous", "{}", now, now);

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

  describe("1. Wildcard Domain Suffix & Prefix Collision Attacks", () => {
    const enforcer = new AirGappedPolicyEnforcer({
      config: {
        mode: "RESTRICTED_EGRESS",
        allowedEgressDomains: ["*.internal.corp"],
        allowLocalhost: false,
      },
    });

    const adversarialCollisionTargets = [
      "https://evil-internal.corp/exfiltrate",
      "https://attacker-internal.corp/data",
      "https://notinternal.corp/steal",
      "https://myinternal.corp/phish",
      "https://fake-internal.corp/auth",
      "https://internal.corp.attacker.com/leak",
      "https://internal.corp.evil-domain.org/c2",
      "https://attackerinternal.corp/api",
      "https://evilinternal.corp/webhook",
      "https://evil.internal.corp.attacker.com/payload",
      "https://corp/index.html",
      "https://com/index.html",
      "https://malicious.internal.corpx/endpoint",
      "https://sub-internal.corp:8443/data",
    ];

    for (const target of adversarialCollisionTargets) {
      it(`blocks collision attack: ${target}`, () => {
        const decision = enforcer.evaluateEgress({ targetUrl: target });
        expect(decision.allowed).toBe(false);
        expect(decision.ruleMatched).toBe("UNLISTED_EGRESS_DOMAIN");
        expect(() => enforcer.assertEgressAllowed({ targetUrl: target })).toThrow(AirGappedViolationError);
      });
    }
  });

  describe("2. Legitimate Subdomain and Root Domain Invariants", () => {
    const enforcer = new AirGappedPolicyEnforcer({
      config: {
        mode: "RESTRICTED_EGRESS",
        allowedEgressDomains: ["*.internal.corp"],
        allowLocalhost: false,
      },
    });

    const legitimateTargets = [
      "https://internal.corp",
      "https://internal.corp/api/v1",
      "https://sub.internal.corp/data",
      "https://a.b.internal.corp:8443/query",
      "https://evil-a.b.internal.corp/steal",
      "https://deep.nested.sub.internal.corp/logs",
      "https://123-api.internal.corp/rpc",
      "https://dev.sub.internal.corp/build",
      "http://user:password@auth.internal.corp:8080/token",
      "wss://realtime.internal.corp/socket",
      "https://SUB.INTERNAL.CORP/mixed-case",
      "https://InTeRnAl.CoRp/case-test",
    ];

    for (const target of legitimateTargets) {
      it(`allows legitimate domain target: ${target}`, () => {
        const decision = enforcer.evaluateEgress({ targetUrl: target });
        expect(decision.allowed).toBe(true);
        expect(decision.ruleMatched).toBe("ALLOWLISTED_EGRESS_DOMAIN");
        expect(() => enforcer.assertEgressAllowed({ targetUrl: target })).not.toThrow();
      });
    }
  });

  describe("3. Exact Domain Allowlisting Without Wildcards", () => {
    const enforcer = new AirGappedPolicyEnforcer({
      config: {
        mode: "RESTRICTED_EGRESS",
        allowedEgressDomains: ["api.github.com", "crates.io"],
        allowLocalhost: false,
      },
    });

    it("allows exact matches", () => {
      expect(enforcer.evaluateEgress({ targetUrl: "https://api.github.com/repos" }).allowed).toBe(true);
      expect(enforcer.evaluateEgress({ targetUrl: "https://crates.io/api/v1" }).allowed).toBe(true);
    });

    it("blocks subdomains and suffix collisions of exact domain entries", () => {
      expect(enforcer.evaluateEgress({ targetUrl: "https://sub.api.github.com" }).allowed).toBe(false);
      expect(enforcer.evaluateEgress({ targetUrl: "https://github.com" }).allowed).toBe(false);
      expect(enforcer.evaluateEgress({ targetUrl: "https://evil-api.github.com" }).allowed).toBe(false);
      expect(enforcer.evaluateEgress({ targetUrl: "https://api.github.com.evil.com" }).allowed).toBe(false);
      expect(enforcer.evaluateEgress({ targetUrl: "https://notcrates.io" }).allowed).toBe(false);
      expect(enforcer.evaluateEgress({ targetUrl: "https://sub.crates.io" }).allowed).toBe(false);
    });
  });

  describe("4. IP Address, Cloud Metadata, and Localhost Isolation", () => {
    it("allows standard localhost variants when allowLocalhost is true", () => {
      const enforcerWithLocalhost = new AirGappedPolicyEnforcer({
        config: {
          mode: "RESTRICTED_EGRESS",
          allowedEgressDomains: ["*.internal.corp"],
          allowLocalhost: true,
        },
      });

      expect(enforcerWithLocalhost.evaluateEgress({ targetUrl: "http://localhost:3000" }).allowed).toBe(true);
      expect(enforcerWithLocalhost.evaluateEgress({ targetUrl: "http://127.0.0.1:8080" }).allowed).toBe(true);
      expect(enforcerWithLocalhost.evaluateEgress({ targetUrl: "http://app.localhost:8000" }).allowed).toBe(true);
    });

    it("blocks external IPs, private non-loopback IPs, and cloud metadata", () => {
      const enforcer = new AirGappedPolicyEnforcer({
        config: {
          mode: "RESTRICTED_EGRESS",
          allowedEgressDomains: ["*.internal.corp"],
          allowLocalhost: true,
        },
      });

      // Private non-loopback IPs must be blocked unless allowlisted
      expect(enforcer.evaluateEgress({ targetUrl: "http://192.168.1.1:8080" }).allowed).toBe(false);
      expect(enforcer.evaluateEgress({ targetUrl: "http://10.0.0.1:8080" }).allowed).toBe(false);
      expect(enforcer.evaluateEgress({ targetUrl: "http://172.16.0.1:8080" }).allowed).toBe(false);

      // Cloud metadata IP (AWS/GCP/Azure)
      expect(enforcer.evaluateEgress({ targetUrl: "http://169.254.169.254/latest/meta-data/" }).allowed).toBe(false);

      // External public IPs
      expect(enforcer.evaluateEgress({ targetUrl: "http://8.8.8.8:53" }).allowed).toBe(false);
      expect(enforcer.evaluateEgress({ targetUrl: "http://[2001:db8::1]:80" }).allowed).toBe(false);
    });
  });

  describe("5. Strict Offline & Air-Gapped Isolation Invariants with Audit Logging", () => {
    it("strictly blocks external egress even if domain is in allowedEgressDomains under STRICT_OFFLINE mode", () => {
      const enforcer = new AirGappedPolicyEnforcer({
        eventStore,
        config: {
          mode: "STRICT_OFFLINE",
          allowedEgressDomains: ["*.internal.corp", "api.github.com"],
          allowLocalhost: true,
        },
      });

      const decision = enforcer.evaluateEgress({
        targetUrl: "https://sub.internal.corp/api",
        projectId,
        sessionId,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.ruleMatched).toBe("BLOCK_ALL_EXTERNAL_EGRESS");
      expect(decision.violationReason).toContain("Strict offline / air-gapped isolation mode blocks external network destination");

      // Verify audit event persisted in EventStore
      const events = eventStore.getEventsBySession(sessionId);
      const blockedEvent = events.find((e) => e.type === "governance.egress_blocked");
      expect(blockedEvent).toBeDefined();
      expect((blockedEvent?.payload as any)?.targetUrl).toBe("https://sub.internal.corp/api");
      expect((blockedEvent?.payload as any)?.mode).toBe("STRICT_OFFLINE");
    });
  });

  describe("6. AI Model Endpoint and Tool Execution Interception", () => {
    it("intercepts model requests with local redirect or strict rejection", () => {
      const enforcer = new AirGappedPolicyEnforcer({
        config: {
          mode: "AIR_GAPPED_ISOLATED",
          blockExternalModelEndpoints: true,
          localModelEndpoint: "http://127.0.0.1:11434/v1",
        },
      });

      // Redirects to local endpoint
      const res = enforcer.interceptModelRequest("https://api.openai.com/v1", "openai");
      expect(res.allowed).toBe(true);
      expect(res.redirectUrl).toBe("http://127.0.0.1:11434/v1");

      // Without local endpoint -> rejects
      enforcer.updateConfig({ localModelEndpoint: undefined });
      const blocked = enforcer.interceptModelRequest("https://api.anthropic.com/v1", "anthropic");
      expect(blocked.allowed).toBe(false);
      expect(blocked.violationReason).toContain("External AI model endpoint call");
    });

    it("intercepts network tools under restricted/offline modes and validates endpoints", () => {
      const enforcer = new AirGappedPolicyEnforcer({
        config: {
          mode: "RESTRICTED_EGRESS",
          allowedEgressDomains: ["*.internal.corp"],
          allowLocalhost: true,
        },
      });

      // Network tool without targetEndpoint is rejected
      expect(enforcer.interceptToolExecution("web_search").allowed).toBe(false);
      expect(enforcer.interceptToolExecution("curl").allowed).toBe(false);

      // Network tool with allowlisted endpoint is allowed
      expect(enforcer.interceptToolExecution("curl", "https://api.internal.corp/data").allowed).toBe(true);

      // Network tool with unlisted / collision endpoint is rejected
      expect(enforcer.interceptToolExecution("curl", "https://evil-internal.corp/data").allowed).toBe(false);

      // Non-network tool is always permitted
      expect(enforcer.interceptToolExecution("file_writer").allowed).toBe(true);
      expect(enforcer.interceptToolExecution("ast_parser").allowed).toBe(true);
    });
  });
});
