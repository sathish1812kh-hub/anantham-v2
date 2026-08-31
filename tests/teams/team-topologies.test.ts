import { describe, it, expect } from "vitest";
import { TeamTopologyEvaluator } from "../../src/teams/team-topology-evaluator.js";
import { TeamDefinition } from "../../src/domain/team.js";

describe("P6.3 Teams — Team Topologies Evaluation", () => {
  const evaluator = new TeamTopologyEvaluator();

  const baseTeam: TeamDefinition = {
    id: "team_top_test",
    version: 1,
    name: "Topology Test Team",
    projectId: "proj_top",
    purpose: "Evaluate topologies",
    roles: ["coordinator", "planner", "implementer", "reviewer", "verifier", "specialist"],
    topology: "coordinator_workers",
    members: [],
    maxMembers: 10,
    communicationPolicy: {
      allowDirectPeerMessages: false,
      maxMessageSizeBytes: 65536,
      requireCoordinatorApprovalForHandoff: false,
    },
    status: "ACTIVE",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
  };

  it("enforces coordinator_workers rules (coordinator mediates when direct peer messages disallowed)", () => {
    const team: TeamDefinition = { ...baseTeam, topology: "coordinator_workers" };

    // Coordinator <-> Worker: Allowed
    expect(evaluator.isCommunicationPermitted(team, "coordinator", "implementer", "STATUS_UPDATE")).toBe(true);
    expect(evaluator.isCommunicationPermitted(team, "implementer", "coordinator", "RESPONSE")).toBe(true);

    // Worker <-> Worker: Blocked when allowDirectPeerMessages is false
    expect(evaluator.isCommunicationPermitted(team, "implementer", "reviewer", "QUERY")).toBe(false);
  });

  it("enforces pipeline progression and backward feedback rules", () => {
    const team: TeamDefinition = { ...baseTeam, topology: "pipeline" };

    // Forward progression: planner (1) -> implementer (2): Allowed
    expect(evaluator.isCommunicationPermitted(team, "planner", "implementer", "TASK_HANDOFF")).toBe(true);
    expect(evaluator.isHandoffPermitted(team, "planner", "implementer")).toBe(true);

    // Forward progression: implementer (2) -> reviewer (3): Allowed
    expect(evaluator.isCommunicationPermitted(team, "implementer", "reviewer", "REVIEW_REQUEST")).toBe(true);
    expect(evaluator.isHandoffPermitted(team, "implementer", "reviewer")).toBe(true);

    // Forward jump: planner (1) -> verifier (4): Blocked
    expect(evaluator.isCommunicationPermitted(team, "planner", "verifier", "TASK_HANDOFF")).toBe(false);
    expect(evaluator.isHandoffPermitted(team, "planner", "verifier")).toBe(false);

    // Backward review rejection / feedback: reviewer (3) -> implementer (2): Allowed
    expect(evaluator.isCommunicationPermitted(team, "reviewer", "implementer", "REVIEW_RESULT")).toBe(true);
    expect(evaluator.isHandoffPermitted(team, "reviewer", "implementer")).toBe(true);
  });

  it("enforces peer_to_peer topology allowing all members to communicate", () => {
    const team: TeamDefinition = { ...baseTeam, topology: "peer_to_peer" };

    expect(evaluator.isCommunicationPermitted(team, "implementer", "reviewer", "QUERY")).toBe(true);
    expect(evaluator.isCommunicationPermitted(team, "implementer", "verifier", "QUERY")).toBe(true);
    expect(evaluator.isCommunicationPermitted(team, "planner", "broadcast", "STATUS_UPDATE")).toBe(true);
  });

  it("enforces specialist_pool topology dispatching through coordinator", () => {
    const team: TeamDefinition = { ...baseTeam, topology: "specialist_pool" };

    expect(evaluator.isCommunicationPermitted(team, "coordinator", "specialist", "QUERY")).toBe(true);
    expect(evaluator.isCommunicationPermitted(team, "specialist", "coordinator", "RESPONSE")).toBe(true);
    expect(evaluator.isCommunicationPermitted(team, "specialist", "implementer", "QUERY")).toBe(false);
  });
});
