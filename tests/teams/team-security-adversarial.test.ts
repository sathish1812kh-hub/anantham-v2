import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import {
  ProjectRepository,
  SessionRepository,
  TaskRepository,
  LeaseRepository,
  TeamRepository,
  PeerMessageRepository,
  HandoffRepository,
} from "../../src/persistence/index.js";
import { TaskClaimManager } from "../../src/tasks/task-claim-manager.js";
import { TeamManager, PeerMessenger, AgentHandoffManager } from "../../src/teams/index.js";

describe("P6.3 Teams — Security Adversarial & Defense In Depth", () => {
  let db: SqliteEngine;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let teamRepo: TeamRepository;
  let messageRepo: PeerMessageRepository;
  let handoffRepo: HandoffRepository;
  let claimManager: TaskClaimManager;
  let teamManager: TeamManager;
  let messenger: PeerMessenger;
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
    messageRepo = new PeerMessageRepository(db);
    handoffRepo = new HandoffRepository(db);

    claimManager = new TaskClaimManager({ engine: db, taskRepo, leaseRepo });
    teamManager = new TeamManager({ teamRepo, claimManager });
    messenger = new PeerMessenger({ teamRepo, messageRepo });
    handoffManager = new AgentHandoffManager({
      engine: db,
      taskRepo,
      leaseRepo,
      teamRepo,
      handoffRepo,
      claimManager,
    });

    projectRepo.save({
      id: "proj_sec",
      name: "Security Project",
      rootPath: "C:/sec_proj",
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
      id: "sess_sec",
      projectId: "proj_sec",
      name: "Security Session",
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
      id: "team_sec",
      version: 1,
      name: "Security Team",
      projectId: "proj_sec",
      purpose: "Adversarial testing",
      roles: ["coordinator", "implementer"],
      topology: "coordinator_workers",
      members: [],
      maxMembers: 10,
      communicationPolicy: { allowDirectPeerMessages: false, maxMessageSizeBytes: 65536, requireCoordinatorApprovalForHandoff: false },
    });

    teamManager.addMember("team_sec", {
      agentId: "agent_sec_coord",
      instanceId: "inst_sec_coord",
      role: "coordinator",
    });

    teamManager.addMember("team_sec", {
      agentId: "agent_sec_worker",
      instanceId: "inst_sec_worker",
      role: "implementer",
    });

    taskRepo.save({
      id: "task_sec",
      sessionId: "sess_sec",
      projectId: "proj_sec",
      title: "Secure Task",
      description: "Adversarial Task",
      objective: "Adversarial Task",
      status: "queued",
      priority: "high",
      targetFiles: ["src/sec.ts"],
      readOnlyFiles: [],
      dependencies: [],
      subtasks: [],
      inputArtifacts: [],
      outputArtifacts: [],
      assignedAgent: null,
      contextBudgetTokens: 10000,
      modelProfile: "default",
      requiredCapabilities: [],
      acceptanceCriteria: ["Passed"],
      retryCount: 0,
      maxRetries: 3,
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("blocks forged coordinator impersonation and rogue handoffs without active ownership", () => {
    // 1. Forged coordinator impersonation (Rogue agent claims coordinator role)
    const forgeMsgRes = messenger.sendMessage({
      id: "msg_forge",
      teamId: "team_sec",
      projectId: "proj_sec",
      senderAgentId: "agent_rogue",
      senderInstanceId: "inst_rogue",
      recipientAgentId: "agent_sec_worker",
      messageType: "STATUS_UPDATE",
      payload: { fake: "instruction" },
      artifactRefs: [],
      timestamp: new Date().toISOString(),
    });
    expect(forgeMsgRes.success).toBe(false);
    expect(forgeMsgRes.errorCode).toBe("SENDER_NOT_ACTIVE_MEMBER");

    // 2. Rogue handoff preparation (Attempting to hand off a task not owned by caller)
    const rogueHandoff = handoffManager.prepareHandoff({
      teamId: "team_sec",
      projectId: "proj_sec",
      sourceAgentId: "agent_sec_worker",
      sourceInstanceId: "inst_sec_worker",
      targetAgentId: "agent_sec_coord",
      taskId: "task_sec",
      leaseId: "lease_fake",
      generation: 1,
      objective: "Rogue handoff",
      acceptanceCriteria: [],
      completedWork: "Nothing",
      unresolvedIssues: [],
      artifactRefs: [],
    });
    expect(rogueHandoff.success).toBe(false);
    expect(rogueHandoff.errorCode).toBe("OWNERSHIP_VERIFICATION_FAILED");
  });
});
