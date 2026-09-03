import { describe, it, expect } from "vitest";
import { TeamWorkspaceManager } from "../../src/saas/team-workspace-manager.js";

describe("PRD-SAAS-004: Team Management & Shared Workspaces", () => {
  const manager = new TeamWorkspaceManager();

  it("creates team, manages members, and shares project workspaces", () => {
    const team = manager.createTeam("team_eng", "Core Engineering", "user_lead");
    expect(team.ownerId).toBe("user_lead");
    expect(team.members.length).toBe(1);

    // Add members
    manager.addMember("team_eng", "user_dev1", "member");
    manager.addMember("team_eng", "user_admin", "admin");
    expect(manager.getTeam("team_eng")?.members.length).toBe(3);

    // Share project
    manager.shareProject("team_eng", "proj_harness");
    expect(manager.getTeam("team_eng")?.sharedProjectIds).toContain("proj_harness");

    // Remove member
    manager.removeMember("team_eng", "user_dev1");
    expect(manager.getTeam("team_eng")?.members.length).toBe(2);
  });
});
