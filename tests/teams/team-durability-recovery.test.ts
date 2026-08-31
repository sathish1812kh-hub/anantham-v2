import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import {
  ProjectRepository,
  TeamRepository,
  PeerMessageRepository,
  HandoffRepository,
} from "../../src/persistence/index.js";
import { TeamManager } from "../../src/teams/index.js";

describe("P6.3 Teams — Durability, WAL Persistence & Crash Recovery", () => {
  const dbPath = join(tmpdir(), `anantham_team_durability_${Date.now()}.db`);
  let db: SqliteEngine;

  beforeEach(() => {
    if (existsSync(dbPath)) unlinkSync(dbPath);
    db = new SqliteEngine({ path: dbPath });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    const projectRepo = new ProjectRepository(db);
    projectRepo.save({
      id: "proj_dur",
      name: "Durability Project",
      rootPath: "C:/dur_proj",
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
  });

  afterEach(() => {
    db.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  it("persists team definitions, members, and messages to SQLite WAL and fully reconstructs state after restart", () => {
    const teamRepo = new TeamRepository(db);
    const messageRepo = new PeerMessageRepository(db);
    const teamManager = new TeamManager({ teamRepo });

    teamManager.createTeam({
      id: "team_dur",
      version: 1,
      name: "Durable Recovery Team",
      projectId: "proj_dur",
      purpose: "Survive crashes",
      roles: ["coordinator", "implementer"],
      topology: "coordinator_workers",
      members: [],
      maxMembers: 10,
      communicationPolicy: { allowDirectPeerMessages: true, maxMessageSizeBytes: 65536, requireCoordinatorApprovalForHandoff: false },
    });

    teamManager.addMember("team_dur", {
      agentId: "agent_dur_coord",
      instanceId: "inst_dur_01",
      role: "coordinator",
    });

    messageRepo.save({
      id: "msg_dur_01",
      teamId: "team_dur",
      projectId: "proj_dur",
      senderAgentId: "agent_dur_coord",
      senderInstanceId: "inst_dur_01",
      recipientAgentId: "broadcast",
      messageType: "STATUS_UPDATE",
      payload: { checkpoint: "saved" },
      artifactRefs: [],
      timestamp: new Date().toISOString(),
    });

    // SIMULATE CRASH & RESTART
    db.close();

    const recoveredDb = new SqliteEngine({ path: dbPath });
    recoveredDb.open();

    const recTeamRepo = new TeamRepository(recoveredDb);
    const recMsgRepo = new PeerMessageRepository(recoveredDb);
    const recTeamManager = new TeamManager({ teamRepo: recTeamRepo });

    const recovery = recTeamManager.recoverTeamState("team_dur");
    expect(recovery.team).toBeDefined();
    expect(recovery.team?.name).toBe("Durable Recovery Team");
    expect(recovery.members.length).toBe(1);
    expect(recovery.members[0].agentId).toBe("agent_dur_coord");

    const recoveredMsgs = recMsgRepo.listByTeam("team_dur");
    expect(recoveredMsgs.length).toBe(1);
    expect(recoveredMsgs[0].id).toBe("msg_dur_01");

    recoveredDb.close();
  });
});
