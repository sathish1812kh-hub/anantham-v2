/**
 * Role-Based Access Control (RBAC) Engine
 * PRD-SAAS-002: Role-Based Access Control (RBAC) Engine
 */

export type UserRole = "owner" | "admin" | "member" | "viewer" | "custom";

export type Permission =
  | "project:create"
  | "project:delete"
  | "session:execute"
  | "session:read"
  | "policy:write"
  | "billing:manage"
  | "team:invite";

export interface UserContext {
  userId: string;
  role: UserRole;
  customPermissions?: Permission[];
}

export class RbacEngine {
  private static readonly DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    owner: [
      "project:create",
      "project:delete",
      "session:execute",
      "session:read",
      "policy:write",
      "billing:manage",
      "team:invite",
    ],
    admin: [
      "project:create",
      "project:delete",
      "session:execute",
      "session:read",
      "policy:write",
      "team:invite",
    ],
    member: [
      "project:create",
      "session:execute",
      "session:read",
    ],
    viewer: [
      "session:read",
    ],
    custom: [],
  };

  public can(user: UserContext, permission: Permission): boolean {
    const rolePermissions = RbacEngine.DEFAULT_ROLE_PERMISSIONS[user.role] ?? [];
    if (rolePermissions.includes(permission)) {
      return true;
    }

    if (user.customPermissions?.includes(permission)) {
      return true;
    }

    return false;
  }
}
