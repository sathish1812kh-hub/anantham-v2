import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, TeamRepository, PeerMessageRepository } from "../../src/persistence/index.js";
import { TeamManager, PeerMessenger } from "../../src/teams/index.js";

describe("P6.3 Teams — Peer Messaging Authorization & Payload Limits", () => {
  let db: SqliteEngine;
  let projectRepo: ProjectRepository;
  let teamRepo: TeamRepository;
  let messageRepo: PeerMessageRepository;
  let teamManager: TeamManager;
  let messenger: PeerMessenger;

  beforeEach(() => {
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    projectRepo = new ProjectRepository(db);
    teamRepo = new TeamRepository(db);
    messageRepo = new PeerMessageRepository(db);
    teamManager = new TeamManager({ teamRepo });
    messenger = new PeerMessenger({ teamRepo, messageRepo });

    projectRepo.save({
      id: "proj_msg",
      name: "Messaging Project",
      rootPath: "C:/msg_proj",
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

    teamManager.createTeam({
      id: "team_msg",
      version: 1,
      name: "Messaging Team",
      projectId: "proj_msg",
      purpose: "Test messaging",
      roles: ["coordinator", "implementer"],
      topology: "coordinator_workers",
      members: [],
      maxMembers: 10,
      communicationPolicy: {
        allowDirectPeerMessages: true,
        maxMessageSizeBytes: 1024, // 1 KB max payload limit for test
        requireCoordinatorApprovalForHandoff: false,
      },
    });

    teamManager.addMember("team_msg", {
      agentId: "agent_coord",
      instanceId: "inst_coord_01",
      role: "coordinator",
    });

    teamManager.addMember("team_msg", {
      agentId: "agent_imp",
      instanceId: "inst_imp_01",
      role: "implementer",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("authorizes valid peer messages and rejects oversized or unauthorized messages", () => {
    // 1. Valid message from coordinator to implementer
    const validSend = messenger.sendMessage({
      id: "msg_01",
      teamId: "team_msg",
      projectId: "proj_msg",
      senderAgentId: "agent_coord",
      senderInstanceId: "inst_coord_01",
      recipientAgentId: "agent_imp",
      messageType: "STATUS_UPDATE",
      payload: { instruction: "Start feature A" },
      artifactRefs: ["art_plan_01"],
      timestamp: new Date().toISOString(),
    });
    expect(validSend.success).toBe(true);

    const savedMsgs = messenger.listMessagesForAgent("team_msg", "agent_imp");
    expect(savedMsgs.length).toBe(1);
    expect(savedMsgs[0].artifactRefs).toContain("art_plan_01");

    // 2. Unauthorized sender (not in team) -> Rejected
    const unauthSend = messenger.sendMessage({
      id: "msg_unauth",
      teamId: "team_msg",
      projectId: "proj_msg",
      senderAgentId: "agent_hacker",
      senderInstanceId: "inst_hacker_99",
      recipientAgentId: "agent_imp",
      messageType: "ALERT",
      payload: { fake: true },
      artifactRefs: [],
      timestamp: new Date().toISOString(),
    });
    expect(unauthSend.success).toBe(false);
    expect(unauthSend.errorCode).toBe("SENDER_NOT_ACTIVE_MEMBER");

    // 3. Oversized payload exceeding 1024 bytes -> Rejected
    const oversizedPayload = { huge: "x".repeat(2000) };
    const oversizedSend = messenger.sendMessage({
      id: "msg_oversized",
      teamId: "team_msg",
      projectId: "proj_msg",
      senderAgentId: "agent_coord",
      senderInstanceId: "inst_coord_01",
      recipientAgentId: "agent_imp",
      messageType: "QUERY",
      payload: oversizedPayload,
      artifactRefs: [],
      timestamp: new Date().toISOString(),
    });
    expect(oversizedSend.success).toBe(false);
    expect(oversizedSend.errorCode).toBe("MESSAGE_SIZE_EXCEEDED");
  });
});
