import { describe, it, expect } from "vitest";
import { PolicyHierarchyResolver, type PolicyLayer } from "../../src/security/policy-hierarchy-resolver.js";

describe("PRD-SEC-004: Dynamic Security Policy Resolution & Inheritance", () => {
  const resolver = new PolicyHierarchyResolver();

  it("enforces monotonic tightening where lower scopes can only restrict, never expand, parent permissions", () => {
    const layers: PolicyLayer[] = [
      {
        scope: "enterprise",
        allowedTools: ["*"],
        blockedTools: ["format_drive"],
        maxRiskLevelWithoutApproval: "execute",
        allowNetwork: true,
        allowDestructive: false,
      },
      {
        scope: "org",
        blockedTools: ["download_binary"],
      },
      {
        scope: "project",
        maxRiskLevelWithoutApproval: "write", // Tighter than enterprise execute
      },
      {
        scope: "session",
        allowNetwork: false, // Session turns off network
      },
      {
        scope: "agent",
        allowedTools: ["view_file", "write_to_file"],
      },
    ];

    const resolved = resolver.resolveHierarchy(layers);

    // Blocked tools are the union of all blocked tools across layers
    expect(resolved.blockedTools).toContain("format_drive");
    expect(resolved.blockedTools).toContain("download_binary");

    // Allowed tools narrowed to agent's explicit list
    expect(resolved.allowedTools).toEqual(["view_file", "write_to_file"]);

    // Max risk without approval narrowed from execute to write
    expect(resolved.maxRiskLevelWithoutApproval).toBe("write");

    // Network turned off by session layer stays false
    expect(resolved.allowNetwork).toBe(false);

    // Destructive remains false
    expect(resolved.allowDestructive).toBe(false);

    // Hierarchy trace captures tightening sequence
    expect(resolved.hierarchyTrace.length).toBe(5);
  });
});
