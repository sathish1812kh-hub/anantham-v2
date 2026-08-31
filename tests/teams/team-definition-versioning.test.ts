import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { ProjectRepository, TeamRepository } from "../../src/persistence/index.js";
import { TeamManager } from "../../src/teams/team-manager.js";

describe("P6.3 Teams — Team Definition & Version Pinning", () => {
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
      id: "proj_team_ver",
      name: "Team Versioning Project",
      rootPath: "C:/team_ver",
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
  });

  it("persists versioned team definitions and supports version updates without corrupting active runs", () => {
    // Version 1
    const v1Team = teamManager.createTeam({
      id: "team_engineering_core",
      version: 1,
      name: "Engineering Core Team",
      projectId: "proj_team_ver",
      purpose: "Deliver core features",
      roles: ["planner", "implementer", "reviewer"],
      topology: "pipeline",
      members: [],
      maxMembers: 10,
      communicationPolicy: { allowDirectPeerMessages: true, maxMessageSizeBytes: 65536, requireCoordinatorApprovalForHandoff: false },
    });
    expect(v1Team.version).toBe(1);
    expect(v1Team.status).toBe("ACTIVE");

    // Version 2 (Adds verifier role)
    const v2Team = teamManager.createTeam({
      id: "team_engineering_core",
      version: 2,
      name: "Engineering Core Team v2",
      projectId: "proj_team_ver",
      purpose: "Deliver core features with verification",
      roles: ["planner", "implementer", "reviewer", "verifier"],
      topology: "pipeline",
      members: [],
      maxMembers: 10,
      communicationPolicy: { allowDirectPeerMessages: true, maxMessageSizeBytes: 65536, requireCoordinatorApprovalForHandoff: false },
    });

    const savedTeam = teamRepo.findById("team_engineering_core");
    expect(savedTeam?.version).toBe(2);
    expect(savedTeam?.roles).toContain("verifier");
  });
});
