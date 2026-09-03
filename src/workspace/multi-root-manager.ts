/**
 * Multi-Root Workspace Manager
 * PRD-PROJ-009: Multi-Root Workspace & Monorepo Support
 */

import { resolve, relative, isAbsolute } from "node:path";
import { existsSync, realpathSync } from "node:fs";

export interface WorkspaceRoot {
  id: string;
  name: string;
  uri: string;
  path: string;
  readOnly?: boolean;
  permissions?: string[];
  tags?: string[];
}

export interface MultiRootSessionConfig {
  sessionId: string;
  roots: WorkspaceRoot[];
}

export class MultiRootManager {
  private sessions: Map<string, Map<string, WorkspaceRoot>> = new Map(); // sessionId -> rootId -> root

  public registerSessionRoots(sessionId: string, roots: WorkspaceRoot[]): void {
    const rootMap = new Map<string, WorkspaceRoot>();
    for (const root of roots) {
      const normalizedPath = resolve(root.path);
      rootMap.set(root.id, {
        ...root,
        path: normalizedPath,
      });
    }
    this.sessions.set(sessionId, rootMap);
  }

  public getSessionRoots(sessionId: string): WorkspaceRoot[] {
    const rootMap = this.sessions.get(sessionId);
    return rootMap ? Array.from(rootMap.values()) : [];
  }

  public getRootById(sessionId: string, rootId: string): WorkspaceRoot | undefined {
    return this.sessions.get(sessionId)?.get(rootId);
  }

  public resolvePathToRoot(
    sessionId: string,
    targetPath: string
  ): { root: WorkspaceRoot; relativePath: string } | null {
    const rootMap = this.sessions.get(sessionId);
    if (!rootMap) return null;

    let absTarget = resolve(targetPath);

    // If file exists, resolve real symlink path to avoid symlink directory escapes
    if (existsSync(absTarget)) {
      try {
        absTarget = realpathSync(absTarget);
      } catch {
        // use resolved absTarget
      }
    }

    for (const root of rootMap.values()) {
      let rootCanonical = root.path;
      if (existsSync(root.path)) {
        try {
          rootCanonical = realpathSync(root.path);
        } catch {}
      }

      const rel = relative(rootCanonical, absTarget);
      if (!rel.startsWith("..") && !isAbsolute(rel)) {
        return { root, relativePath: rel };
      }
    }

    return null;
  }

  public validateAccess(
    sessionId: string,
    targetPath: string,
    mode: "read" | "write"
  ): { allowed: boolean; reason?: string } {
    // 1. Guard against obvious path traversal tokens
    if (targetPath.includes("..") && !isAbsolute(targetPath)) {
      const abs = resolve(targetPath);
      const match = this.resolvePathToRoot(sessionId, abs);
      if (!match) {
        return {
          allowed: false,
          reason: `Security Guard: Path traversal out of workspace root bounds is prohibited (${targetPath})`,
        };
      }
    }

    const match = this.resolvePathToRoot(sessionId, targetPath);
    if (!match) {
      return {
        allowed: false,
        reason: `Target path ${targetPath} does not belong to any configured root in session ${sessionId}`,
      };
    }

    if (mode === "write" && match.root.readOnly) {
      return {
        allowed: false,
        reason: `Root '${match.root.name}' (${match.root.id}) is configured as read-only`,
      };
    }

    return { allowed: true };
  }

  public checkRootsExist(sessionId: string): { rootId: string; exists: boolean }[] {
    const roots = this.getSessionRoots(sessionId);
    return roots.map((r) => ({
      rootId: r.id,
      exists: existsSync(r.path),
    }));
  }
}
