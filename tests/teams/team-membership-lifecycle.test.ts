import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, TeamRepository } from "../../src/persistence/index.js";
import { TeamManager } from "../../src/teams/team-manager.js";

describe("P6.3 Teams — Team Membership Lifecycle & Capacity Bounds", () => {
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
      id: "proj_member_lc",
      name: "Membership Project",
      rootPath: "C:/member_proj",
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
      id: "team_bounded_cap",
      version: 1,
      name: "Bounded Capacity Team",
      projectId: "proj_member_lc",
      purpose: "Test capacity",
      roles: ["coordinator", "implementer"],
      topology: "coordinator_workers",
      members: [],
      maxMembers: 2, // Max 2 members
      communicationPolicy: { allowDirectPeerMessages: true, maxMessageSizeBytes: 65536, requireCoordinatorApprovalForHandoff: false },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("enforces role definitions and team capacity limits", () => {
    // 1. Add invalid role -> Fails
    const invalidRoleRes = teamManager.addMember("team_bounded_cap", {
      agentId: "agent_unknown",
      instanceId: "inst_01",
      role: "verifier" as any, // Not in roles
    });
    expect(invalidRoleRes.success).toBe(false);
    expect(invalidRoleRes.errorCode).toBe("INVALID_TEAM_ROLE");

    // 2. Add Member 1 (Coordinator) -> Success
    const m1Res = teamManager.addMember("team_bounded_cap", {
      agentId: "agent_coord",
      instanceId: "inst_01",
      role: "coordinator",
    });
    expect(m1Res.success).toBe(true);

    // 3. Add Member 2 (Implementer) -> Success (hits max capacity 2)
    const m2Res = teamManager.addMember("team_bounded_cap", {
      agentId: "agent_imp",
      instanceId: "inst_02",
      role: "implementer",
    });
    expect(m2Res.success).toBe(true);

    // 4. Add Member 3 -> Fails (capacity exceeded)
    const m3Res = teamManager.addMember("team_bounded_cap", {
      agentId: "agent_imp2",
      instanceId: "inst_03",
      role: "implementer",
    });
    expect(m3Res.success).toBe(false);
    expect(m3Res.errorCode).toBe("MAX_MEMBERS_EXCEEDED");

    // 5. Update status
    teamManager.updateMemberStatus("team_bounded_cap", "inst_02", "BUSY");
    const updatedMember = teamRepo.getMemberByInstance("team_bounded_cap", "inst_02");
    expect(updatedMember?.status).toBe("BUSY");
  });
});
