import { describe, it, expect } from "vitest";
import { TenantIsolationManager } from "../../src/saas/tenant-isolation-manager.js";

describe("PRD-SAAS-001: Multi-Tenant Isolation & Architecture", () => {
  const manager = new TenantIsolationManager();

  it("registers tenants and prevents cross-tenant resource access", () => {
    manager.registerTenant({
      tenantId: "tenant_alpha",
      organizationId: "org_alpha",
      name: "Alpha Corp",
      isolationMode: "schema",
    });

    manager.registerTenant({
      tenantId: "tenant_beta",
      organizationId: "org_beta",
      name: "Beta LLC",
      isolationMode: "schema",
    });

    expect(manager.validateAccess("tenant_alpha", "tenant_alpha").allowed).toBe(true);

    const crossTenant = manager.validateAccess("tenant_alpha", "tenant_beta");
    expect(crossTenant.allowed).toBe(false);
    expect(crossTenant.reason).toContain("Cross-tenant access forbidden");
  });

  it("appends tenant scoping clause to queries", () => {
    const scoped1 = manager.scopeQuery("SELECT * FROM sessions", "tenant_alpha");
    expect(scoped1).toBe("SELECT * FROM sessions WHERE tenant_id = 'tenant_alpha'");

    const scoped2 = manager.scopeQuery("SELECT * FROM sessions WHERE status = 'active'", "tenant_alpha");
    expect(scoped2).toBe("SELECT * FROM sessions WHERE status = 'active' AND tenant_id = 'tenant_alpha'");
  });
});
