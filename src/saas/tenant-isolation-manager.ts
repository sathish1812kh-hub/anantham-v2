/**
 * Multi-Tenant Data Isolation & Organization Scoping
 * PRD-SAAS-001: Multi-Tenant Isolation & Architecture
 */

export interface TenantContext {
  tenantId: string;
  organizationId: string;
  name: string;
  isolationMode: "schema" | "row_level" | "dedicated";
}

export class TenantIsolationManager {
  private tenants: Map<string, TenantContext> = new Map();

  public registerTenant(tenant: TenantContext): void {
    this.tenants.set(tenant.tenantId, tenant);
  }

  public getTenant(tenantId: string): TenantContext | undefined {
    return this.tenants.get(tenantId);
  }

  public validateAccess(requestTenantId: string, resourceTenantId: string): { allowed: boolean; reason?: string } {
    if (requestTenantId !== resourceTenantId) {
      return {
        allowed: false,
        reason: `Cross-tenant access forbidden: Requesting tenant '${requestTenantId}' cannot access resource owned by tenant '${resourceTenantId}'`,
      };
    }
    return { allowed: true };
  }

  public scopeQuery(baseQuery: string, tenantId: string): string {
    const cleanTenantId = tenantId.replace(/'/g, "''");
    if (baseQuery.toLowerCase().includes("where")) {
      return `${baseQuery} AND tenant_id = '${cleanTenantId}'`;
    }
    return `${baseQuery} WHERE tenant_id = '${cleanTenantId}'`;
  }
}
