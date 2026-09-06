import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  validateOpenRouterKey,
  DEFAULT_OPENROUTER_REFERER,
  DEFAULT_OPENROUTER_TITLE,
  OPENROUTER_AUTH_KEY_ENDPOINT,
} from "../../src/persistence/openrouter-key-validator.js";
import { UserConfigManager } from "../../src/persistence/user-config-manager.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";

describe("Adversarial & Stress Suite: OpenRouterKeyValidator & Pre-Persistence Gating", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Dimension 1: Header Validation
  // =========================================================================
  describe("1. Header Validation (Authorization, HTTP-Referer, X-Title)", () => {
    it("strictly verifies method is GET and exact required headers are sent", async () => {
      let capturedUrl = "";
      let capturedOptions: RequestInit | undefined;

      const mockFetch = vi.fn().mockImplementation((url, opts) => {
        capturedUrl = String(url);
        capturedOptions = opts;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { label: "Exact Header Key", limit: 50, usage: 1.0, is_free_tier: false } }),
        } as Response);
      });

      const result = await validateOpenRouterKey("sk-or-v1-strict-headers-9999", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.valid).toBe(true);
      expect(capturedUrl).toBe(OPENROUTER_AUTH_KEY_ENDPOINT);
      expect(capturedOptions?.method).toBe("GET");
      expect(capturedOptions?.headers).toEqual({
        Authorization: "Bearer sk-or-v1-strict-headers-9999",
        "HTTP-Referer": "https://github.com/antigravity/cli",
        "X-Title": "Antigravity CLI",
      });
      expect(capturedOptions?.signal).toBeDefined();
    });

    it("trims raw API key before embedding into Authorization Bearer header", async () => {
      let capturedAuthHeader = "";

      const mockFetch = vi.fn().mockImplementation((_url, opts) => {
        capturedAuthHeader = (opts?.headers as Record<string, string>)?.Authorization || "";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { label: "Trimmed Key" } }),
        } as Response);
      });

      const result = await validateOpenRouterKey("   \t\n sk-or-v1-padded-key-1234  \r\n  ", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.valid).toBe(true);
      expect(capturedAuthHeader).toBe("Bearer sk-or-v1-padded-key-1234");
    });

    it("supports custom HTTP-Referer and X-Title overrides while maintaining Authorization", async () => {
      let capturedHeaders: Record<string, string> = {};

      const mockFetch = vi.fn().mockImplementation((_url, opts) => {
        capturedHeaders = opts?.headers as Record<string, string>;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { label: "Custom App" } }),
        } as Response);
      });

      await validateOpenRouterKey("sk-or-v1-custom-options", {
        fetchFn: mockFetch as unknown as typeof fetch,
        referer: "https://my-enterprise-domain.internal/app",
        title: "Enterprise Custom Agent CLI v3",
      });

      expect(capturedHeaders["Authorization"]).toBe("Bearer sk-or-v1-custom-options");
      expect(capturedHeaders["HTTP-Referer"]).toBe("https://my-enterprise-domain.internal/app");
      expect(capturedHeaders["X-Title"]).toBe("Enterprise Custom Agent CLI v3");
    });

    it("handles keys with hostile characters (symbols, dots, underscores, dashes)", async () => {
      let capturedAuth = "";

      const mockFetch = vi.fn().mockImplementation((_url, opts) => {
        capturedAuth = (opts?.headers as Record<string, string>)?.Authorization || "";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { label: "Hostile Symbol Key" } }),
        } as Response);
      });

      const hostileKey = "sk-or-v1-abc.123_456~xyz!@$-+=/";
      const result = await validateOpenRouterKey(hostileKey, {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.valid).toBe(true);
      expect(capturedAuth).toBe(`Bearer ${hostileKey}`);
    });
  });

  // =========================================================================
  // Dimension 2: Metadata Extraction Edge Cases
  // =========================================================================
  describe("2. Metadata Extraction Edge Cases (Null limit, Negative usage, Missing fields, Malformed JSON)", () => {
    it("preserves null limit as unlimited and does not convert to 0 or NaN", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            label: "Unlimited Enterprise Account",
            limit: null,
            usage: 84.192,
            is_free_tier: false,
          },
        }),
      } as unknown as Response);

      const result = await validateOpenRouterKey("sk-or-v1-unlimited", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.valid).toBe(true);
      expect(result.metadata?.limit).toBeNull();
      expect(result.metadata?.limit).not.toBe(0);
      expect(result.metadata?.limit).not.toBe(NaN);
      expect(result.metadata?.limit).not.toBeUndefined();
    });

    it("coerces numeric string limits to number and non-numeric string limits to null", async () => {
      const mockFetchNumeric = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { limit: "250.75", usage: 0 } }),
      } as unknown as Response);

      const resNumeric = await validateOpenRouterKey("sk-or-v1-numstr", {
        fetchFn: mockFetchNumeric as unknown as typeof fetch,
      });
      expect(resNumeric.metadata?.limit).toBe(250.75);

      const mockFetchNonNumeric = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { limit: "unlimited_tier", usage: 0 } }),
      } as unknown as Response);

      const resNonNumeric = await validateOpenRouterKey("sk-or-v1-nonnumstr", {
        fetchFn: mockFetchNonNumeric as unknown as typeof fetch,
      });
      expect(resNonNumeric.metadata?.limit).toBeNull();
    });

    it("preserves limit of exactly 0 as a depleted quota (distinct from unlimited null)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { limit: 0, usage: 100 } }),
      } as unknown as Response);

      const result = await validateOpenRouterKey("sk-or-v1-zero-limit", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.valid).toBe(true);
      expect(result.metadata?.limit).toBe(0);
    });

    it("handles negative usage cleanly (promotional credit / adjustment balance)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            label: "Credit Adjusted Key",
            limit: 100,
            usage: -5.5,
            is_free_tier: false,
          },
        }),
      } as unknown as Response);

      const result = await validateOpenRouterKey("sk-or-v1-neg-usage", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.valid).toBe(true);
      expect(result.metadata?.usage).toBe(-5.5);
    });

    it("preserves high-precision floating point usage values without truncation", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            usage: 0.0000456789,
          },
        }),
      } as unknown as Response);

      const result = await validateOpenRouterKey("sk-or-v1-micro-usage", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.valid).toBe(true);
      expect(result.metadata?.usage).toBe(0.0000456789);
    });

    it("falls back to Default Key when label and name are both absent or empty", async () => {
      const mockFetchEmpty = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            label: "",
            name: "",
            limit: null,
            usage: 0,
          },
        }),
      } as unknown as Response);

      const result = await validateOpenRouterKey("sk-or-v1-nolabel", {
        fetchFn: mockFetchEmpty as unknown as typeof fetch,
      });

      expect(result.valid).toBe(true);
      expect(result.metadata?.label).toBe("Default Key");
    });

    it("prioritizes label over name when both are present", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            label: "Explicit Label",
            name: "Fallback Name",
          },
        }),
      } as unknown as Response);

      const result = await validateOpenRouterKey("sk-or-v1-labelname", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.metadata?.label).toBe("Explicit Label");
    });

    it("handles completely empty JSON payload ({}) with safe defaults", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response);

      const result = await validateOpenRouterKey("sk-or-v1-emptypayload", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.valid).toBe(true);
      expect(result.metadata?.label).toBe("Default Key");
      expect(result.metadata?.limit).toBeNull();
      expect(result.metadata?.usage).toBe(0);
      expect(result.metadata?.is_free_tier).toBe(false);
      expect(result.metadata?.rateLimit).toBeUndefined();
    });

    it("gracefully rejects non-object JSON payloads (null, primitives)", async () => {
      const mockFetchNull = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => null,
      } as unknown as Response);

      const resNull = await validateOpenRouterKey("sk-or-v1-nullpayload", {
        fetchFn: mockFetchNull as unknown as typeof fetch,
      });
      expect(resNull.valid).toBe(false);
      expect(resNull.error).toContain("Invalid JSON response payload");

      const mockFetchPrim = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => "OK string response",
      } as unknown as Response);

      const resPrim = await validateOpenRouterKey("sk-or-v1-primpairload", {
        fetchFn: mockFetchPrim as unknown as typeof fetch,
      });
      expect(resPrim.valid).toBe(false);
      expect(resPrim.error).toContain("Invalid JSON response payload");
    });

    it("rejects Cloudflare HTML error responses masquerading under 200 OK", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON at position 0");
        },
      } as unknown as Response);

      const result = await validateOpenRouterKey("sk-or-v1-cloudflarehtml", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe(200);
      expect(result.error).toContain("Invalid JSON response from OpenRouter auth API");
    });

    it("handles rate_limit partial object or malformed types gracefully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            rate_limit: {
              requests: "unlimited_requests", // string instead of number
              interval: 60, // number instead of string
            },
          },
        }),
      } as unknown as Response);

      const result = await validateOpenRouterKey("sk-or-v1-badratelimit", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.valid).toBe(true);
      expect(result.metadata?.rateLimit?.requests).toBeUndefined();
      expect(result.metadata?.rateLimit?.interval).toBeUndefined();
    });
  });

  // =========================================================================
  // Dimension 3: Error Status Code Mapping & Network Failure Stress
  // =========================================================================
  describe("3. Error Status Code Mapping (401, 403, 429, 500+, Timeouts, Network Drops)", () => {
    const errorCases = [
      { status: 401, text: "Unauthorized", expectedSubstring: "Invalid or revoked" },
      { status: 403, text: "Forbidden", expectedSubstring: "permissions" },
      { status: 429, text: "Too Many Requests", expectedSubstring: "rate limit" },
      { status: 400, text: "Bad Request", expectedSubstring: "400" },
      { status: 404, text: "Not Found", expectedSubstring: "404" },
      { status: 500, text: "Internal Server Error", expectedSubstring: "500" },
      { status: 502, text: "Bad Gateway", expectedSubstring: "502" },
      { status: 503, text: "Service Unavailable", expectedSubstring: "503" },
      { status: 504, text: "Gateway Timeout", expectedSubstring: "504" },
    ];

    for (const ec of errorCases) {
      it(`accurately maps HTTP ${ec.status} ${ec.text} to valid=false and status=${ec.status}`, async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: ec.status,
          statusText: ec.text,
        } as unknown as Response);

        const result = await validateOpenRouterKey("sk-or-v1-statuscheck", {
          fetchFn: mockFetch as unknown as typeof fetch,
        });

        expect(result.valid).toBe(false);
        expect(result.status).toBe(ec.status);
        expect(result.error).toContain(ec.expectedSubstring);
      });
    }

    it("handles abrupt network connection drop (ECONNREFUSED / fetch TypeError)", async () => {
      const netError = new TypeError("fetch failed: connect ECONNREFUSED 127.0.0.1:443");
      const mockFetch = vi.fn().mockRejectedValue(netError);

      const result = await validateOpenRouterKey("sk-or-v1-connrefused", {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Network error validating OpenRouter key");
      expect(result.error).toContain("ECONNREFUSED");
    });

    it("detects when fetch is completely missing in runtime environment", async () => {
      const savedGlobal = globalThis.fetch;
      try {
        (globalThis as any).fetch = undefined;
        const resMissing = await validateOpenRouterKey("sk-or-v1-nofetch");
        expect(resMissing.valid).toBe(false);
        expect(resMissing.error).toContain("Fetch API is unavailable");
      } finally {
        globalThis.fetch = savedGlobal;
      }
    });
  });

  // =========================================================================
  // Dimension 4: Rejection Gating & Pre-Persistence Security Invariants
  // =========================================================================
  describe("4. Rejection Gating & Zero-Disk-Write Invariant on Invalid Keys", () => {
    let testConfigDir: string;
    let testWorkspaceDir: string;
    let engine: SqliteEngine;
    let projectRepo: ProjectRepository;
    let sessionRepo: SessionRepository;
    let taskRepo: TaskRepository;
    let controller: SessionController;
    let registry: CommandRegistry;
    let parser: CommandParser;

    beforeEach(() => {
      delete process.env.OPENROUTER_API_KEY;

      testConfigDir = path.join(os.tmpdir(), `anantham-gate-cfg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      testWorkspaceDir = path.join(os.tmpdir(), `anantham-gate-ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.mkdirSync(testWorkspaceDir, { recursive: true });

      UserConfigManager.resetInstance();
      UserConfigManager.getInstance(testConfigDir);

      engine = new SqliteEngine({ path: ":memory:" });
      engine.open();
      const migrator = new MigrationEngine(engine);
      migrator.migrate();

      projectRepo = new ProjectRepository(engine);
      sessionRepo = new SessionRepository(engine);
      taskRepo = new TaskRepository(engine);

      controller = new SessionController({ projectRepo, sessionRepo });
      registry = new CommandRegistry({
        sessionController: controller,
        projectRepo,
        taskRepo,
        engine,
      });
      parser = new CommandParser();
    });

    afterEach(() => {
      delete process.env.OPENROUTER_API_KEY;
      UserConfigManager.resetInstance();
      engine.close();

      try {
        fs.rmSync(testConfigDir, { recursive: true, force: true });
        fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup
      }
    });

    it("UserConfigManager.validateAndSetApiKey rejects HTTP 401 with zero disk mutation or env leak", async () => {
      const configPath = path.join(testConfigDir, "config.json");
      expect(fs.existsSync(configPath)).toBe(false);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as unknown as Response);

      const manager = UserConfigManager.getInstance(testConfigDir);
      const res = await manager.validateAndSetApiKey("openrouter", "sk-or-v1-revoked-attempt", testWorkspaceDir, {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(res.valid).toBe(false);
      expect(res.status).toBe(401);

      // Invariant: Config file MUST NOT have been created on disk
      expect(fs.existsSync(configPath)).toBe(false);

      // Invariant: Workspace .env MUST NOT have been created
      const workspaceDotEnv = path.join(testWorkspaceDir, ".env");
      expect(fs.existsSync(workspaceDotEnv)).toBe(false);

      // Invariant: process.env MUST NOT have been mutated
      expect(process.env.OPENROUTER_API_KEY).toBeUndefined();
    });

    it("CLI /key set openrouter rejects invalid key (401) and does not write to disk or env", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as unknown as Response);

      const cmd = parser.parse("/key set openrouter sk-or-v1-cli-rejected-401");
      const res = await registry.execute(cmd);

      expect(res.success).toBe(false);
      expect(res.message).toContain("✖ OpenRouter API key validation failed");
      expect(res.message).toContain("Invalid or revoked");

      // Invariant 1: No config.json written
      const configPath = path.join(testConfigDir, "config.json");
      expect(fs.existsSync(configPath)).toBe(false);

      // Invariant 2: process.env untouched
      expect(process.env.OPENROUTER_API_KEY).toBeUndefined();
    });

    it("CLI /connect openrouter rejects 500 server error and protects state", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as unknown as Response);

      const cmd = parser.parse("/connect openrouter sk-or-v1-cli-rejected-500");
      const res = await registry.execute(cmd);

      expect(res.success).toBe(false);
      expect(res.message).toContain("✖ OpenRouter API key validation failed");
      expect(res.message).toContain("HTTP 500");
      expect(process.env.OPENROUTER_API_KEY).toBeUndefined();
    });

    it("preserves pre-existing valid key when subsequent key attempt fails validation", async () => {
      // 1. First set a valid key
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { label: "Original Valid Key", limit: 100, usage: 2.0, is_free_tier: false },
        }),
      } as unknown as Response);

      const cmdValid = parser.parse("/key set openrouter sk-or-v1-original-good-key");
      const resValid = await registry.execute(cmdValid);
      expect(resValid.success).toBe(true);
      expect(process.env.OPENROUTER_API_KEY).toBe("sk-or-v1-original-good-key");

      const configPath = path.join(testConfigDir, "config.json");
      expect(fs.existsSync(configPath)).toBe(true);
      const originalConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(originalConfig.apiKeys.openrouter).toBe("sk-or-v1-original-good-key");
      expect(originalConfig.keyMetadata.openrouter.label).toBe("Original Valid Key");

      // 2. Now attempt to set a new key that fails with 401
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as unknown as Response);

      const cmdBad = parser.parse("/key set openrouter sk-or-v1-subsequent-bad-key");
      const resBad = await registry.execute(cmdBad);

      expect(resBad.success).toBe(false);

      // Invariant: Original good key is preserved in process.env and on disk!
      expect(process.env.OPENROUTER_API_KEY).toBe("sk-or-v1-original-good-key");
      const preservedConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(preservedConfig.apiKeys.openrouter).toBe("sk-or-v1-original-good-key");
      expect(preservedConfig.keyMetadata.openrouter.label).toBe("Original Valid Key");
    });

    it("stress tests 30 rapid sequential invalid attempts without leaking or corrupting config", async () => {
      const failureModes = [
        { status: 401, text: "Unauthorized" },
        { status: 403, text: "Forbidden" },
        { status: 429, text: "Rate Limited" },
        { status: 500, text: "Server Error" },
        { status: 503, text: "Overloaded" },
      ];

      for (let i = 0; i < 30; i++) {
        const mode = failureModes[i % failureModes.length]!;
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: mode.status,
          statusText: mode.text,
        } as unknown as Response);

        const cmd = parser.parse(`/key set openrouter sk-or-v1-hostile-attempt-${i}`);
        const res = await registry.execute(cmd);

        expect(res.success).toBe(false);
        expect(process.env.OPENROUTER_API_KEY).toBeUndefined();
      }

      // After 30 attempts, config must still not have openrouter key
      const configPath = path.join(testConfigDir, "config.json");
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        expect(cfg.apiKeys?.openrouter).toBeUndefined();
      }
    });

    it("concurrently validates multiple requests without cross-talk or race conditions", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const current = callCount;
        // Alternate valid and invalid
        if (current % 2 === 0) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: { label: `Concurrent Key ${current}` } }),
          } as Response);
        } else {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: "Unauthorized",
          } as Response);
        }
      });

      const promises = Array.from({ length: 10 }, (_, i) => {
        return validateOpenRouterKey(`sk-or-v1-concurrent-${i}`);
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      const validResults = results.filter((r) => r.valid);
      const invalidResults = results.filter((r) => !r.valid);

      expect(validResults.length).toBe(5);
      expect(invalidResults.length).toBe(5);

      for (const inv of invalidResults) {
        expect(inv.status).toBe(401);
        expect(inv.error).toContain("Invalid or revoked");
      }
    });

    it("dual-config persistence: CLI /key set writes to ~/.antigravity and never corrupts ~/.anantham fallback", async () => {
      const fallbackDir = path.join(os.tmpdir(), `anantham-fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      fs.mkdirSync(fallbackDir, { recursive: true });

      // Seed fallback with existing legacy configuration
      const legacyConfigFile = path.join(fallbackDir, "config.json");
      fs.writeFileSync(
        legacyConfigFile,
        JSON.stringify({
          apiKeys: { anthropic: "sk-legacy-anthropic" },
          defaultModel: "anthropic/claude-3.5-sonnet",
        }),
        "utf-8"
      );

      UserConfigManager.resetInstance();
      UserConfigManager.getInstance(testConfigDir, fallbackDir);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { label: "Dual Path Valid Key", limit: 50, usage: 1.0, is_free_tier: false },
        }),
      } as unknown as Response);

      const cmd = parser.parse("/key set openrouter sk-or-v1-dual-path-success");
      const res = await registry.execute(cmd);
      expect(res.success).toBe(true);

      // Verify primary config written
      const primaryConfigFile = path.join(testConfigDir, "config.json");
      expect(fs.existsSync(primaryConfigFile)).toBe(true);
      const primaryData = JSON.parse(fs.readFileSync(primaryConfigFile, "utf-8"));
      expect(primaryData.apiKeys.openrouter).toBe("sk-or-v1-dual-path-success");
      // Migrated legacy key is preserved in primary
      expect(primaryData.apiKeys.anthropic).toBe("sk-legacy-anthropic");

      // Verify fallback file was NEVER mutated with the new openrouter key
      const fallbackData = JSON.parse(fs.readFileSync(legacyConfigFile, "utf-8"));
      expect(fallbackData.apiKeys.openrouter).toBeUndefined();
      expect(fallbackData.apiKeys.anthropic).toBe("sk-legacy-anthropic");

      try {
        fs.rmSync(fallbackDir, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    });
  });
});
