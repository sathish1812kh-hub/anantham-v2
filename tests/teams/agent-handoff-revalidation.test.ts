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

describe("P6.3 Teams — Agent Handoff Revalidation & Rejection Handling", () => {
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
      id: "proj_reval",
      name: "Reval Project",
      rootPath: "C:/reval_proj",
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
      id: "sess_reval",
      projectId: "proj_reval",
      name: "Reval Session",
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
      id: "team_reval",
      version: 1,
      name: "Reval Team",
      projectId: "proj_reval",
      purpose: "Test revalidation",
      roles: ["implementer", "reviewer"],
      topology: "pipeline",
      members: [],
      maxMembers: 10,
      communicationPolicy: { allowDirectPeerMessages: true, maxMessageSizeBytes: 65536, requireCoordinatorApprovalForHandoff: false },
    });

    teamManager.addMember("team_reval", {
      agentId: "agent_dev_reval",
      instanceId: "inst_dev_reval_01",
      role: "implementer",
    });

    teamManager.addMember("team_reval", {
      agentId: "agent_rev_reval",
      instanceId: "inst_rev_reval_01",
      role: "reviewer",
    });

    taskRepo.save({
      id: "task_reval",
      sessionId: "sess_reval",
      projectId: "proj_reval",
      title: "Build feature Y",
      description: "Feature implementation",
      objective: "Feature implementation",
      status: "queued",
      priority: "normal",
      targetFiles: ["src/y.ts"],
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

  it("handles handoff rejection and preserves original lease ownership", () => {
    const claimRes = claimManager.claimTask({
      taskId: "task_reval",
      agentId: "agent_dev_reval",
      instanceId: "inst_dev_reval_01",
      projectId: "proj_reval",
      sessionId: "sess_reval",
      ttlMs: 30000,
    });
    const lease = claimRes.lease!;

    const prepRes = handoffManager.prepareHandoff({
      teamId: "team_reval",
      projectId: "proj_reval",
      sourceAgentId: "agent_dev_reval",
      sourceInstanceId: "inst_dev_reval_01",
      targetAgentId: "agent_rev_reval",
      taskId: "task_reval",
      leaseId: lease.id,
      generation: lease.generation,
      objective: "Review code diff",
      acceptanceCriteria: ["Tests pass"],
      completedWork: "Created feature Y",
      unresolvedIssues: [],
      artifactRefs: ["art_diff_y"],
    });

    const handoff = prepRes.handoff!;
    expect(handoff.status).toBe("PREPARED");

    // Reviewer rejects handoff due to failed acceptance criteria
    const rejected = handoffManager.rejectHandoff(handoff.id, "Missing unit tests");
    expect(rejected).toBe(true);

    const updatedHandoff = handoffRepo.findById(handoff.id);
    expect(updatedHandoff?.status).toBe("REJECTED");
    expect(updatedHandoff?.unresolvedIssues).toContain("Rejected: Missing unit tests");

    // Source agent retains active lease
    const sourceLease = leaseRepo.findById(lease.id);
    expect(sourceLease?.status).toBe("ACTIVE");
  });
});
