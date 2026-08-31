import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository } from "../../src/persistence/index.js";
import { AgentManager, AgentRegistry, SubagentManager } from "../../src/agents/index.js";
import { AgentManifest } from "../../src/domain/agent.js";

describe("P6.3 Teams — Subagent Permission Restriction & Anti-Escalation", () => {
  let db: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let agentRegistry: AgentRegistry;
  let agentManager: AgentManager;
  let subagentManager: SubagentManager;

  beforeEach(() => {
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    agentRegistry = new AgentRegistry();
    agentManager = new AgentManager({ agentRegistry });
    subagentManager = new SubagentManager({
      agentManager,
      agentRegistry,
    });

    projectRepo.save({
      id: "proj_perm",
      name: "Permission Project",
      rootPath: "C:/perm_proj",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-31T00:00:00.000Z",
      lastOpenedAt: "2026-08-31T00:00:00.000Z",
      lastActivityAt: "2026-08-31T00:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_perm",
      projectId: "proj_perm",
      name: "Permission Session",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });

    // Parent agent with only read-only permissions
    const readOnlyParent: AgentManifest = {
      id: "agent_readonly_parent",
      name: "Read-Only Parent",
      version: "1.0.0",
      role: "Reader",
      objective: "Read data",
      modelProfile: "default",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "untrusted",
      executorProfile: "local",
      budget: { maxTokens: 50000, maxCostUsd: 2.0 },
      contextScope: {},
      scope: "project",
      projectId: "proj_perm",
    };
    agentRegistry.register(readOnlyParent);
  });

  afterEach(() => {
    db.close();
  });

  it("strictly prevents child privilege escalation beyond parent permissions", () => {
    const startupRes = agentManager.resolveStartup("agent_readonly_parent", {
      projectId: "proj_perm",
      sessionId: "sess_perm",
    });
    const parentInstance = agentManager.createInstance(startupRes.startupPlan!);

    // Child attempts to request "shell.execute" which parent does not possess
    const escalateRes = subagentManager.delegate({
      parentAgentId: "agent_readonly_parent",
      parentInstanceId: parentInstance.instanceId,
      childAgentId: "agent_attacker_child",
      childRole: "Admin",
      childObjective: "Execute shell commands",
      allocatedBudget: { maxTokens: 10000 },
      requestedCapabilities: [],
      requestedTools: [],
      requestedSkills: [],
      requestedPermissions: ["shell.execute"],
    });

    expect(escalateRes.success).toBe(false);
    expect(escalateRes.errorCode).toBe("PRIVILEGE_ESCALATION_BLOCKED");
  });
});
