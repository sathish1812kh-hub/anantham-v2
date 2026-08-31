import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import {
  ProjectRepository,
  SessionRepository,
  TaskRepository,
  LeaseRepository,
  TeamRepository,
  HandoffRepository,
} from "../../src/persistence/index.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { TeamManager, AgentHandoffManager } from "../../src/teams/index.js";

describe("P6.3 Teams — Agent Handoff & Atomic Ownership Transfer", () => {
  let db: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let teamRepo: TeamRepository;
  let handoffRepo: HandoffRepository;
  let claimManager: TaskClaimManager;
  let teamManager: TeamManager;
  let handoffManager: AgentHandoffManager;

  beforeEach(() => {
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    taskRepo = new TaskRepository(db);
    leaseRepo = new LeaseRepository(db);
    teamRepo = new TeamRepository(db);
    handoffRepo = new HandoffRepository(db);

    claimManager = new TaskClaimManager({ engine: db, taskRepo, leaseRepo });
    teamManager = new TeamManager({ teamRepo, claimManager });
    handoffManager = new AgentHandoffManager({
      engine: db,
      taskRepo,
      leaseRepo,
      teamRepo,
      handoffRepo,
      claimManager,
    });

    projectRepo.save({
      id: "proj_ho",
      name: "Handoff Project",
      rootPath: "C:/ho_proj",
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
      id: "sess_ho",
      projectId: "proj_ho",
      name: "Handoff Session",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });

    teamManager.createTeam({
      id: "team_ho",
      version: 1,
      name: "Pipeline Handoff Team",
      projectId: "proj_ho",
      purpose: "Test handoffs",
      roles: ["implementer", "reviewer"],
      topology: "pipeline",
      members: [],
      maxMembers: 10,
      communicationPolicy: { allowDirectPeerMessages: true, maxMessageSizeBytes: 65536, requireCoordinatorApprovalForHandoff: false },
    });

    teamManager.addMember("team_ho", {
      agentId: "agent_dev",
      instanceId: "inst_dev_01",
      role: "implementer",
    });

    teamManager.addMember("team_ho", {
      agentId: "agent_rev",
      instanceId: "inst_rev_01",
      role: "reviewer",
    });

    taskRepo.save({
      id: "task_auth_ho",
      sessionId: "sess_ho",
      projectId: "proj_ho",
      title: "Build feature X",
      description: "Feature implementation",
      objective: "Feature implementation",
      status: "queued",
      priority: "high",
      targetFiles: ["src/x.ts"],
      readOnlyFiles: [],
      dependencies: [],
      subtasks: [],
      inputArtifacts: [],
      outputArtifacts: [],
      assignedAgent: null,
      contextBudgetTokens: 10000,
      modelProfile: "default",
      requiredCapabilities: [],
      acceptanceCriteria: ["Tests pass"],
      retryCount: 0,
      maxRetries: 3,
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("atomically transfers lease ownership, increments generation fencing token, and fences source agent", () => {
    // 1. Initial claim by implementer
    const claimRes = claimManager.claimTask({
      taskId: "task_auth_ho",
      agentId: "agent_dev",
      instanceId: "inst_dev_01",
      projectId: "proj_ho",
      sessionId: "sess_ho",
      ttlMs: 30000,
    });
    expect(claimRes.success).toBe(true);
    const sourceLease = claimRes.lease!;
    expect(sourceLease.generation).toBe(1);

    // 2. Prepare handoff from Implementer -> Reviewer
    const prepRes = handoffManager.prepareHandoff({
      teamId: "team_ho",
      projectId: "proj_ho",
      sourceAgentId: "agent_dev",
      sourceInstanceId: "inst_dev_01",
      targetAgentId: "agent_rev",
      taskId: "task_auth_ho",
      leaseId: sourceLease.id,
      generation: sourceLease.generation,
      objective: "Review code diff",
      acceptanceCriteria: ["All tests pass"],
      completedWork: "Created feature X implementation",
      unresolvedIssues: [],
      artifactRefs: ["art_diff_01"],
    });
    expect(prepRes.success).toBe(true);
    const handoff = prepRes.handoff!;
    expect(handoff.status).toBe("PREPARED");

    // 3. Accept handoff by Reviewer
    const acceptRes = handoffManager.acceptHandoff(handoff.id, "inst_rev_01");
    expect(acceptRes.success).toBe(true);
    const newLease = acceptRes.newLease!;
    expect(newLease.generation).toBe(2);
    expect(newLease.agentId).toBe("agent_rev");
    expect(newLease.instanceId).toBe("inst_rev_01");

    // 4. Source lease is RELEASED
    const prevLeaseState = leaseRepo.findById(sourceLease.id);
    expect(prevLeaseState?.status).toBe("RELEASED");

    // 5. Source agent is FENCED OUT (attempts to heartbeat or complete with old generation 1 fail)
    const staleHeartbeat = claimManager.heartbeat({
      leaseId: sourceLease.id,
      taskId: "task_auth_ho",
      agentId: "agent_dev",
      instanceId: "inst_dev_01",
      generation: 1,
    });
    expect(staleHeartbeat.success).toBe(false);

    const staleComplete = claimManager.completeTask({
      taskId: "task_auth_ho",
      leaseId: sourceLease.id,
      generation: 1,
      agentId: "agent_dev",
    });
    expect(staleComplete).toBe(false);
  });
});
