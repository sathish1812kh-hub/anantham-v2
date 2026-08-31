import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, SessionRepository } from "../../src/persistence/index.js";
import { AgentManager, AgentRegistry, SubagentManager, DelegationGuard } from "../../src/agents/index.js";
import { AgentManifest } from "../../src/domain/agent.js";

describe("P6.3 Teams — Subagent Delegation Bounds", () => {
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
      delegationGuard: new DelegationGuard({ maxDepth: 3, maxChildren: 2 }),
    });

    projectRepo.save({
      id: "proj_del",
      name: "Delegation Project",
      rootPath: "C:/del_proj",
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
      id: "sess_del",
      projectId: "proj_del",
      name: "Delegation Session",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });

    const rootManifest: AgentManifest = {
      id: "agent_root",
      name: "Root Coordinator",
      version: "1.0.0",
      role: "Coordinator",
      objective: "Coordinate work",
      modelProfile: "default",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: { maxTokens: 50000, maxCostUsd: 2.0 },
      contextScope: {},
      scope: "project",
      projectId: "proj_del",
    };
    agentRegistry.register(rootManifest);
  });

  afterEach(() => {
    db.close();
  });

  it("enforces max delegation depth (depth <= 3) and max children fan-out limits", () => {
    const startupRes = agentManager.resolveStartup("agent_root", {
      projectId: "proj_del",
      sessionId: "sess_del",
    });
    const rootInstance = agentManager.createInstance(startupRes.startupPlan!);

    // Level 1: Child 1 (Success)
    const child1Res = subagentManager.delegate({
      parentAgentId: "agent_root",
      parentInstanceId: rootInstance.instanceId,
      childAgentId: "agent_child_1",
      childRole: "Worker 1",
      childObjective: "Task 1",
      allocatedBudget: { maxTokens: 20000 },
      requestedCapabilities: [],
      requestedTools: [],
      requestedSkills: [],
      requestedPermissions: [],
    });
    expect(child1Res.success).toBe(true);

    // Level 1: Child 2 (Success - hits maxChildren limit of 2)
    const child2Res = subagentManager.delegate({
      parentAgentId: "agent_root",
      parentInstanceId: rootInstance.instanceId,
      childAgentId: "agent_child_2",
      childRole: "Worker 2",
      childObjective: "Task 2",
      allocatedBudget: { maxTokens: 20000 },
      requestedCapabilities: [],
      requestedTools: [],
      requestedSkills: [],
      requestedPermissions: [],
    });
    expect(child2Res.success).toBe(true);

    // Level 1: Child 3 (Fails - max children exceeded)
    const child3Res = subagentManager.delegate({
      parentAgentId: "agent_root",
      parentInstanceId: rootInstance.instanceId,
      childAgentId: "agent_child_3",
      childRole: "Worker 3",
      childObjective: "Task 3",
      allocatedBudget: { maxTokens: 10000 },
      requestedCapabilities: [],
      requestedTools: [],
      requestedSkills: [],
      requestedPermissions: [],
    });
    expect(child3Res.success).toBe(false);
    expect(child3Res.errorCode).toBe("MAX_CHILDREN_EXCEEDED");

    // Level 2: Child 1 delegates to Grandchild (Depth 2, Success)
    const grandChildRes = subagentManager.delegate({
      parentAgentId: "agent_child_1",
      parentInstanceId: child1Res.childInstanceId!,
      childAgentId: "agent_grandchild_1",
      childRole: "Specialist",
      childObjective: "Subtask",
      allocatedBudget: { maxTokens: 10000 },
      requestedCapabilities: [],
      requestedTools: [],
      requestedSkills: [],
      requestedPermissions: [],
    });
    expect(grandChildRes.success).toBe(true);

    // Level 3: Grandchild delegates to Great-Grandchild (Depth 3, Success)
    const greatGrandChildRes = subagentManager.delegate({
      parentAgentId: "agent_grandchild_1",
      parentInstanceId: grandChildRes.childInstanceId!,
      childAgentId: "agent_great_grandchild_1",
      childRole: "Leaf",
      childObjective: "Leaf Subtask",
      allocatedBudget: { maxTokens: 5000 },
      requestedCapabilities: [],
      requestedTools: [],
      requestedSkills: [],
      requestedPermissions: [],
    });
    expect(greatGrandChildRes.success).toBe(true);

    // Level 4: Exceeds maxDepth (3) -> Fails
    const depthExceededRes = subagentManager.delegate({
      parentAgentId: "agent_great_grandchild_1",
      parentInstanceId: greatGrandChildRes.childInstanceId!,
      childAgentId: "agent_leaf_sub",
      childRole: "Forbidden",
      childObjective: "Forbidden Subtask",
      allocatedBudget: { maxTokens: 1000 },
      requestedCapabilities: [],
      requestedTools: [],
      requestedSkills: [],
      requestedPermissions: [],
    });
    expect(depthExceededRes.success).toBe(false);
    expect(depthExceededRes.errorCode).toBe("MAX_DELEGATION_DEPTH_EXCEEDED");
  });
});
