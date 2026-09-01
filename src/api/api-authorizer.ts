import { type ApiAuthContext } from "../domain/api.js";

/**
 * API Authorizer enforcing project tenant containment and role permissions.
 * PRD Part 1 Section 34 & PRD Part 2 Section 200.
 */
export class ApiAuthorizer {
  /**
   * Enforce project containment for request context.
   */
  public static authorizeProject(auth: ApiAuthContext, projectId: string): boolean {
    if (!auth.authenticated) return false;
    if (auth.allowedProjects.includes("*")) return true;
    return auth.allowedProjects.includes(projectId);
  }

  /**
   * Enforce role-based access for privileged operations.
   */
  public static authorizeRole(auth: ApiAuthContext, requiredRole: "viewer" | "operator" | "admin"): boolean {
    if (!auth.authenticated) return false;
    if (auth.role === "admin") return true;
    if (auth.role === "operator" && requiredRole !== "admin") return true;
    if (auth.role === "viewer" && requiredRole === "viewer") return true;
    return false;
  }
}
