import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import {
  ProjectRepository,
  TeamRepository,
  PeerMessageRepository,
} from "../../src/persistence/index.js";
import { TeamManager, PeerMessenger } from "../../src/teams/index.js";

describe("P6.3 Teams — Cross-Project Boundary Isolation", () => {
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

    // Project Alpha
    projectRepo.save({
      id: "proj_alpha",
      name: "Alpha Project",
      rootPath: "C:/alpha",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem_a",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-31T00:00:00.000Z",
      lastOpenedAt: "2026-08-31T00:00:00.000Z",
      lastActivityAt: "2026-08-31T00:00:00.000Z",
    });

    // Project Beta
    projectRepo.save({
      id: "proj_beta",
      name: "Beta Project",
      rootPath: "C:/beta",
      status: "active",
      tags: [],
      modelProfile: "m",
      memoryNamespace: "mem_b",
      orchestrationProfile: "o",
      trustProfile: "developer",
      createdAt: "2026-08-31T00:00:00.000Z",
      lastOpenedAt: "2026-08-31T00:00:00.000Z",
      lastActivityAt: "2026-08-31T00:00:00.000Z",
    });

    teamManager.createTeam({
      id: "team_alpha",
      version: 1,
      name: "Alpha Team",
      projectId: "proj_alpha",
      purpose: "Alpha work",
      roles: ["implementer"],
      topology: "peer_to_peer",
      members: [],
      maxMembers: 10,
      communicationPolicy: { allowDirectPeerMessages: true, maxMessageSizeBytes: 65536, requireCoordinatorApprovalForHandoff: false },
    });

    teamManager.addMember("team_alpha", {
      agentId: "agent_alpha_dev",
      instanceId: "inst_alpha_01",
      role: "implementer",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("strictly blocks cross-project team queries, messages, and spoofing", () => {
    // 1. Team listing is isolated by project
    const alphaTeams = teamRepo.listByProject("proj_alpha");
    expect(alphaTeams.length).toBe(1);

    const betaTeams = teamRepo.listByProject("proj_beta");
    expect(betaTeams.length).toBe(0);

    // 2. Cross-project message injection -> Blocked
    const crossMsgRes = messenger.sendMessage({
      id: "msg_cross_attack",
      teamId: "team_alpha",
      projectId: "proj_beta", // Mismatched project
      senderAgentId: "agent_alpha_dev",
      senderInstanceId: "inst_alpha_01",
      recipientAgentId: "agent_alpha_dev",
      messageType: "STATUS_UPDATE",
      payload: { leak: true },
      artifactRefs: [],
      timestamp: new Date().toISOString(),
    });

    expect(crossMsgRes.success).toBe(false);
    expect(crossMsgRes.errorCode).toBe("PROJECT_ISOLATION_VIOLATION");
  });
});
