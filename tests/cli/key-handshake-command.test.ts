import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository } from "../../src/persistence/repositories/project-repository.js";
import { SessionRepository } from "../../src/persistence/repositories/session-repository.js";
import { TaskRepository } from "../../src/persistence/repositories/task-repository.js";
import { SessionController } from "../../src/cli/session-controller.js";
import { CommandRegistry } from "../../src/cli/command-registry.js";
import { CommandParser } from "../../src/cli/command-parser.js";
import { UserConfigManager } from "../../src/persistence/user-config-manager.js";

describe("CLI /key and /connect OpenRouter Handshake Integration", () => {
  let engine: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let controller: SessionController;
  let registry: CommandRegistry;
  let parser: CommandParser;
  let testConfigDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;

    testConfigDir = path.join(os.tmpdir(), `anantham-keytest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(testConfigDir, { recursive: true });

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
    globalThis.fetch = originalFetch;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;

    UserConfigManager.resetInstance();
    engine.close();

    try {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it("successfully validates and connects an OpenRouter API key via /key set", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          label: "Research Workspace Key",
          limit: 100,
          usage: 3.456,
          is_free_tier: false,
        },
      }),
    } as unknown as Response);

    const cmd = parser.parse("/key set openrouter sk-or-v1-validprodkey12345");
    const res = await registry.execute(cmd);

    expect(res.success).toBe(true);
    expect(res.message).toContain("✔ API key for provider 'openrouter' connected successfully!");
    expect(res.message).toContain("Label: Research Workspace Key");
    expect(res.message).toContain("Usage: $3.4560 USD | Limit: $100 USD");
    expect(res.message).toContain("Tier: Paid");
    expect(res.message).toContain("~/.antigravity/config.json");

    // Verify process.env sync
    expect(process.env.OPENROUTER_API_KEY).toBe("sk-or-v1-validprodkey12345");

    // Verify config persistence
    const savedConfig = JSON.parse(fs.readFileSync(path.join(testConfigDir, "config.json"), "utf-8"));
    expect(savedConfig.apiKeys.openrouter).toBe("sk-or-v1-validprodkey12345");
    expect(savedConfig.keyMetadata.openrouter.label).toBe("Research Workspace Key");
    expect(savedConfig.keyMetadata.openrouter.usage).toBe(3.456);
  });

  it("rejects invalid OpenRouter API key (401) without persisting or setting process.env", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as unknown as Response);

    const cmd = parser.parse("/key set openrouter sk-or-v1-invalidkey99999");
    const res = await registry.execute(cmd);

    expect(res.success).toBe(false);
    expect(res.message).toContain("✖ OpenRouter API key validation failed");
    expect(res.message).toContain("Invalid or revoked");

    // Verify process.env was NOT modified
    expect(process.env.OPENROUTER_API_KEY).toBeUndefined();

    // Verify config file was NOT created or does NOT have the key
    const configPath = path.join(testConfigDir, "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config.apiKeys?.openrouter).toBeUndefined();
    }
  });

  it("handles /connect openrouter alias with handshake validation", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          label: "Connect Alias Key",
          limit: null,
          usage: 0,
          is_free_tier: true,
        },
      }),
    } as unknown as Response);

    const cmd = parser.parse("/connect openrouter sk-or-v1-aliasvalidkey");
    const res = await registry.execute(cmd);

    expect(res.success).toBe(true);
    expect(res.message).toContain("Label: Connect Alias Key");
    expect(res.message).toContain("Limit: Unlimited");
    expect(res.message).toContain("Tier: Free Tier");
    expect(process.env.OPENROUTER_API_KEY).toBe("sk-or-v1-aliasvalidkey");
  });

  it("connects non-OpenRouter providers directly without OpenRouter HTTP validation", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const cmd = parser.parse("/key set openai sk-proj-openai987654321");
    const res = await registry.execute(cmd);

    expect(res.success).toBe(true);
    expect(res.message).toContain("✔ API key for provider 'openai' connected successfully!");
    expect(process.env.OPENAI_API_KEY).toBe("sk-proj-openai987654321");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("displays rich metadata in /key list when configured", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          label: "Audit Key",
          limit: 50,
          usage: 1.25,
          is_free_tier: false,
        },
      }),
    } as unknown as Response);

    await registry.execute(parser.parse("/key set openrouter sk-or-v1-auditkey123"));

    const resList = await registry.execute(parser.parse("/key list"));
    expect(resList.success).toBe(true);
    expect(resList.message).toContain("openrouter");
    expect(resList.message).toContain("✔ Configured");
    expect(resList.message).toContain("Audit Key");
    expect(resList.message).toContain("usage: $1.2500 / $50");
  });

  it("removes key and metadata via /key remove", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { label: "To Delete", limit: 10, usage: 0, is_free_tier: true },
      }),
    } as unknown as Response);

    await registry.execute(parser.parse("/key set openrouter sk-or-v1-todelete123"));
    expect(process.env.OPENROUTER_API_KEY).toBe("sk-or-v1-todelete123");

    const resRemove = await registry.execute(parser.parse("/key remove openrouter"));
    expect(resRemove.success).toBe(true);
    expect(resRemove.message).toContain("removed from config and environment");
    expect(process.env.OPENROUTER_API_KEY).toBeUndefined();

    const config = JSON.parse(fs.readFileSync(path.join(testConfigDir, "config.json"), "utf-8"));
    expect(config.apiKeys.openrouter).toBeUndefined();
    expect(config.keyMetadata?.openrouter).toBeUndefined();
  });
});
