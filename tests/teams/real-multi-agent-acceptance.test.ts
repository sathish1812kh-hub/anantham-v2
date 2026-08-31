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

describe("P6.3 Teams — Real Multi-Agent Team Acceptance Scenario", () => {
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
      id: "proj_real_team",
      name: "Autonomous Engineering Team",
      rootPath: "C:/eng_team",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem_eng",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-31T00:00:00.000Z",
      lastOpenedAt: "2026-08-31T00:00:00.000Z",
      lastActivityAt: "2026-08-31T00:00:00.000Z",
    });

    sessionRepo.save({
      id: "sess_real_team",
      projectId: "proj_real_team",
      name: "Sprint 42",
      branch: "main",
      status: "active",
      modelProfile: "m",
      keyPoolProfile: "k",
      mode: "interactive",
      permissions: {},
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });

    // Create 4-role Pipeline Team
    teamManager.createTeam({
      id: "team_engineering_pod",
      version: 1,
      name: "Engineering Pod Alpha",
      projectId: "proj_real_team",
      purpose: "Design, build, review, and verify high-assurance modules",
      roles: ["planner", "implementer", "reviewer", "verifier"],
      topology: "pipeline",
      members: [],
      maxMembers: 10,
      communicationPolicy: {
        allowDirectPeerMessages: true,
        maxMessageSizeBytes: 65536,
        requireCoordinatorApprovalForHandoff: false,
      },
    });

    // Add 4 Team Members
    teamManager.addMember("team_engineering_pod", {
      agentId: "agent_planner",
      instanceId: "inst_plan_01",
      role: "planner",
    });
    teamManager.addMember("team_engineering_pod", {
      agentId: "agent_developer",
      instanceId: "inst_dev_01",
      role: "implementer",
    });
    teamManager.addMember("team_engineering_pod", {
      agentId: "agent_reviewer",
      instanceId: "inst_rev_01",
      role: "reviewer",
    });
    teamManager.addMember("team_engineering_pod", {
      agentId: "agent_verifier",
      instanceId: "inst_ver_01",
      role: "verifier",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("executes an end-to-end multi-agent pipeline: Planner -> Implementer -> Reviewer -> Verifier with lease transitions and artifact references", () => {
    // 1. Planner creates Task
    taskRepo.save({
      id: "task_multi_01",
      sessionId: "sess_real_team",
      projectId: "proj_real_team",
      title: "Implement Distributed Consensus Gate",
      description: "Produce robust state gate",
      objective: "Produce robust state gate",
      status: "queued",
      priority: "critical",
      targetFiles: ["src/consensus/gate.ts"],
      readOnlyFiles: [],
      dependencies: [],
      subtasks: [],
      inputArtifacts: [],
      outputArtifacts: [],
      assignedAgent: null,
      contextBudgetTokens: 25000,
      modelProfile: "default",
      requiredCapabilities: ["typescript", "sqlite"],
      acceptanceCriteria: ["All unit tests pass", "Fencing verified"],
      retryCount: 0,
      maxRetries: 3,
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });

    // 2. Implementer claims Task (Acquires Generation 1 Lease)
    const claimRes = claimManager.claimTask({
      taskId: "task_multi_01",
      agentId: "agent_developer",
      instanceId: "inst_dev_01",
      projectId: "proj_real_team",
      sessionId: "sess_real_team",
      ttlMs: 30000,
    });
    expect(claimRes.success).toBe(true);
    const devLease = claimRes.lease!;
    expect(devLease.generation).toBe(1);

    // Implementer broadcasts status update with plan artifact
    messenger.sendMessage({
      id: "msg_dev_started",
      teamId: "team_engineering_pod",
      projectId: "proj_real_team",
      senderAgentId: "agent_developer",
      senderInstanceId: "inst_dev_01",
      recipientAgentId: "agent_reviewer",
      messageType: "STATUS_UPDATE",
      payload: { status: "Coding started", etaMinutes: 15 },
      artifactRefs: ["art_spec_01"],
      taskRef: "task_multi_01",
      timestamp: new Date().toISOString(),
    });

    // 3. Implementer prepares handoff to Reviewer with implementation diff artifact
    const hoToRev = handoffManager.prepareHandoff({
      teamId: "team_engineering_pod",
      projectId: "proj_real_team",
      sourceAgentId: "agent_developer",
      sourceInstanceId: "inst_dev_01",
      targetAgentId: "agent_reviewer",
      taskId: "task_multi_01",
      leaseId: devLease.id,
      generation: devLease.generation,
      objective: "Review code diff for consensus gate",
      acceptanceCriteria: ["All unit tests pass", "Fencing verified"],
      completedWork: "Created gate.ts and test suite",
      unresolvedIssues: [],
      artifactRefs: ["art_diff_gate_01"],
    });
    expect(hoToRev.success).toBe(true);

    // 4. Reviewer accepts handoff (Acquires Generation 2 Lease)
    const acceptRev = handoffManager.acceptHandoff(hoToRev.handoff!.id, "inst_rev_01");
    expect(acceptRev.success).toBe(true);
    const revLease = acceptRev.newLease!;
    expect(revLease.generation).toBe(2);
    expect(revLease.agentId).toBe("agent_reviewer");

    // Developer is now fenced out
    const devStaleHeartbeat = claimManager.heartbeat({
      leaseId: devLease.id,
      taskId: "task_multi_01",
      agentId: "agent_developer",
      instanceId: "inst_dev_01",
      generation: 1,
    });
    expect(devStaleHeartbeat.success).toBe(false);

    // 5. Reviewer approves and hands off to Verifier
    const hoToVer = handoffManager.prepareHandoff({
      teamId: "team_engineering_pod",
      projectId: "proj_real_team",
      sourceAgentId: "agent_reviewer",
      sourceInstanceId: "inst_rev_01",
      targetAgentId: "agent_verifier",
      taskId: "task_multi_01",
      leaseId: revLease.id,
      generation: revLease.generation,
      objective: "Execute verification suite",
      acceptanceCriteria: ["All unit tests pass", "Fencing verified"],
      completedWork: "Code approved by reviewer",
      unresolvedIssues: [],
      artifactRefs: ["art_diff_gate_01", "art_review_report_01"],
    });
    expect(hoToVer.success).toBe(true);

    // 6. Verifier accepts handoff (Acquires Generation 3 Lease)
    const acceptVer = handoffManager.acceptHandoff(hoToVer.handoff!.id, "inst_ver_01");
    expect(acceptVer.success).toBe(true);
    const verLease = acceptVer.newLease!;
    expect(verLease.generation).toBe(3);
    expect(verLease.agentId).toBe("agent_verifier");

    // 7. Verifier successfully completes task
    const completeRes = claimManager.completeTask({
      taskId: "task_multi_01",
      leaseId: verLease.id,
      generation: 3,
      agentId: "agent_verifier",
    });
    expect(completeRes).toBe(true);

    const finalTask = taskRepo.findById("task_multi_01");
    expect(finalTask?.status).toBe("completed");
  });
});
