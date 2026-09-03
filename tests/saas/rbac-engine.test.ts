import { describe, it, expect } from "vitest";
import { RbacEngine } from "../../src/saas/rbac-engine.js";

describe("PRD-SAAS-002: Role-Based Access Control (RBAC) Engine", () => {
  const rbac = new RbacEngine();

  it("enforces role permissions: Owner, Admin, Member, Viewer", () => {
    // Owner can do everything
    expect(rbac.can({ userId: "u1", role: "owner" }, "billing:manage")).toBe(true);
    expect(rbac.can({ userId: "u1", role: "owner" }, "project:delete")).toBe(true);

    // Admin can delete projects but cannot manage billing
    expect(rbac.can({ userId: "u2", role: "admin" }, "project:delete")).toBe(true);
    expect(rbac.can({ userId: "u2", role: "admin" }, "billing:manage")).toBe(false);

    // Member can execute sessions but cannot delete projects
    expect(rbac.can({ userId: "u3", role: "member" }, "session:execute")).toBe(true);
    expect(rbac.can({ userId: "u3", role: "member" }, "project:delete")).toBe(false);

    // Viewer can only read
    expect(rbac.can({ userId: "u4", role: "viewer" }, "session:read")).toBe(true);
    expect(rbac.can({ userId: "u4", role: "viewer" }, "session:execute")).toBe(false);
  });

  it("supports custom permissions for fine-grained roles", () => {
    const customUser = {
      userId: "u_custom",
      role: "custom" as const,
      customPermissions: ["session:execute" as const],
    };

    expect(rbac.can(customUser, "session:execute")).toBe(true);
    expect(rbac.can(customUser, "project:delete")).toBe(false);
  });
});
