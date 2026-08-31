import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, TeamRepository } from "../../src/persistence/index.js";
import { TeamManager } from "../../src/teams/index.js";

describe("P6.3 Teams — Failure Propagation Policy", () => {
  let db: SqliteEngine;
  let projectRepo: ProjectRepository;
  let teamRepo: TeamRepository;
  let teamManager: TeamManager;

  beforeEach(() => {
    db = new SqliteEngine({ path: ":memory:" });
    db.open();
    const migrator = new MigrationEngine(db);
    migrator.migrate();

    projectRepo = new ProjectRepository(db);
    teamRepo = new TeamRepository(db);
    teamManager = new TeamManager({ teamRepo });

    projectRepo.save({
      id: "proj_fail_prop",
      name: "Fail Prop Project",
      rootPath: "C:/fail_proj",
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
      id: "team_fail_prop",
      version: 1,
      name: "Fail Prop Team",
      projectId: "proj_fail_prop",
      purpose: "Test failure policy",
      roles: ["coordinator", "implementer"],
      topology: "coordinator_workers",
      members: [],
      maxMembers: 10,
      communicationPolicy: { allowDirectPeerMessages: true, maxMessageSizeBytes: 65536, requireCoordinatorApprovalForHandoff: false },
    });

    teamManager.addMember("team_fail_prop", {
      agentId: "agent_fail_1",
      instanceId: "inst_fail_01",
      role: "implementer",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("handles member failure with RETRY policy preserving team status", () => {
    const res = teamManager.handleMemberFailure("team_fail_prop", "inst_fail_01", "Process crash", "RETRY");
    expect(res.action).toBe("RETRY");
    expect(res.status).toBe("MEMBER_FAILED");

    const member = teamRepo.getMemberByInstance("team_fail_prop", "inst_fail_01");
    expect(member?.status).toBe("FAILED");

    const team = teamRepo.findById("team_fail_prop");
    expect(team?.status).toBe("ACTIVE");
  });

  it("handles catastrophic member failure with FAIL_TEAM policy cancelling entire team", () => {
    const res = teamManager.handleMemberFailure("team_fail_prop", "inst_fail_01", "Fatal security breach", "FAIL_TEAM");
    expect(res.action).toBe("FAIL_TEAM");
    expect(res.status).toBe("TEAM_CANCELLED");

    const team = teamRepo.findById("team_fail_prop");
    expect(team?.status).toBe("CANCELLED");
  });
});
