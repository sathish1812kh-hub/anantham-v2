import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import {
  ProjectRepository,
  SessionRepository,
  TeamRepository,
} from "../../src/persistence/index.js";
import { AgentManager, AgentRegistry, SubagentManager } from "../../src/agents/index.js";
import { TeamManager } from "../../src/teams/index.js";
import { AgentManifest } from "../../src/domain/agent.js";

describe("P6.3 Teams — Cancellation Propagation", () => {
  let db: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let teamRepo: TeamRepository;
  let agentRegistry: AgentRegistry;
  let agentManager: AgentManager;
  let subagentManager: SubagentManager;
  let teamManager: TeamManager;

  beforeEach(() => {
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    teamRepo = new TeamRepository(db);
    agentRegistry = new AgentRegistry();
    agentManager = new AgentManager({ agentRegistry });
    subagentManager = new SubagentManager({ agentManager, agentRegistry });
    teamManager = new TeamManager({ teamRepo, agentManager });

    projectRepo.save({
      id: "proj_cancel",
      name: "Cancel Project",
      rootPath: "C:/cancel_proj",
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
      id: "sess_cancel",
      projectId: "proj_cancel",
      name: "Cancel Session",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });

    const manifest: AgentManifest = {
      id: "agent_canceller",
      name: "Canceller Agent",
      version: "1.0.0",
      role: "Worker",
      objective: "Do work",
      modelProfile: "default",
      requiredCapabilities: [],
      tools: [],
      skills: [],
      permissionProfile: "developer",
      executorProfile: "local",
      budget: { maxTokens: 50000, maxCostUsd: 2.0 },
      contextScope: {},
      scope: "project",
      projectId: "proj_cancel",
    };
    agentRegistry.register(manifest);
  });

  afterEach(() => {
    db.close();
  });

  it("cascades cancellation across all team members and child subagent trees", () => {
    // 1. Create team & member instance
    teamManager.createTeam({
      id: "team_canc",
      version: 1,
      name: "Cancel Team",
      projectId: "proj_cancel",
      purpose: "Test cancel",
      roles: ["implementer"],
      topology: "peer_to_peer",
      members: [],
      maxMembers: 10,
      communicationPolicy: { allowDirectPeerMessages: true, maxMessageSizeBytes: 65536, requireCoordinatorApprovalForHandoff: false },
    });

    const startup = agentManager.resolveStartup("agent_canceller", {
      projectId: "proj_cancel",
      sessionId: "sess_cancel",
    });
    const parentInstance = agentManager.createInstance(startup.startupPlan!);

    teamManager.addMember("team_canc", {
      agentId: "agent_canceller",
      instanceId: parentInstance.instanceId,
      role: "implementer",
    });

    // 2. Delegate to child subagent
    const childRes = subagentManager.delegate({
      parentAgentId: "agent_canceller",
      parentInstanceId: parentInstance.instanceId,
      childAgentId: "agent_canceller_sub",
      childRole: "Helper",
      childObjective: "Subtask",
      allocatedBudget: { maxTokens: 10000 },
      requestedCapabilities: [],
      requestedTools: [],
      requestedSkills: [],
      requestedPermissions: [],
    });
    expect(childRes.success).toBe(true);

    const childInstance = agentManager.getInstance(childRes.childInstanceId!);
    expect(childInstance?.status).toBe("running");

    // 3. Propagate cancellation from parent
    const cancelled = subagentManager.propagateCancellation(parentInstance.instanceId);
    expect(cancelled).toContain(parentInstance.instanceId);
    expect(cancelled).toContain(childRes.childInstanceId);

    expect(agentManager.getInstance(parentInstance.instanceId)?.status).toBe("stopped");
    expect(agentManager.getInstance(childRes.childInstanceId!)?.status).toBe("stopped");

    // 4. Cancel Team
    teamManager.cancelTeam("team_canc", "Test teardown");
    const teamState = teamRepo.findById("team_canc");
    expect(teamState?.status).toBe("CANCELLED");
  });
});
