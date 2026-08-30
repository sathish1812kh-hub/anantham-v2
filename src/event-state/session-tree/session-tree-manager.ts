import type { Session } from "../../domain/session.js";
import { EventTypes, type HarnessEvent } from "../../domain/event.js";
import type { SessionRepository } from "../../persistence/repositories/session-repository.js";
import type { EventStore } from "../event-store.js";

export interface ForkSessionOptions {
  newSessionId: string;
  name?: string;
  branch: string;
  mode?: "interactive" | "autonomous" | "supervised" | "headless";
  permissions?: Record<string, boolean | string>;
  modelProfile?: string;
  keyPoolProfile?: string;
}

export interface SessionTreeNode {
  session: Session;
  children: SessionTreeNode[];
}

/**
 * SessionTreeManager manages session hierarchies, branching, ancestry tracing, and forking.
 * PRD Part 1 Section 35 & 36 (Session Tree / Forking).
 */
export class SessionTreeManager {
  private readonly sessionRepo: SessionRepository;
  private readonly eventStore: EventStore;

  constructor(sessionRepo: SessionRepository, eventStore: EventStore) {
    this.sessionRepo = sessionRepo;
    this.eventStore = eventStore;
  }

  /**
   * Forks an existing session into a new branch without mutating the parent session.
   * Section 7: "Do not silently mutate the parent branch when creating a child branch."
   */
  public forkSession(
    sourceSessionId: string,
    options: ForkSessionOptions
  ): { newSession: Session; forkEvent: Readonly<HarnessEvent> } {
    const parentSession = this.sessionRepo.findById(sourceSessionId);
    if (!parentSession) {
      throw new Error(`Cannot fork from non-existent session '${sourceSessionId}'.`);
    }

    const now = new Date().toISOString();
    const forkedSession: Session = {
      id: options.newSessionId,
      projectId: parentSession.projectId,
      name: options.name ?? `${parentSession.name} (fork - ${options.branch})`,
      branch: options.branch,
      parentSessionId: sourceSessionId,
      status: "active",
      modelProfile: options.modelProfile ?? parentSession.modelProfile,
      keyPoolProfile: options.keyPoolProfile ?? parentSession.keyPoolProfile,
      mode: options.mode ?? parentSession.mode,
      permissions: options.permissions ?? { ...parentSession.permissions },
      createdAt: now,
      updatedAt: now,
    };

    // Save forked session to repository
    this.sessionRepo.save(forkedSession);

    // Commit fork event to authoritative event log
    const forkEvent: HarnessEvent = {
      id: `evt_fork_${options.newSessionId}_${Date.now()}`,
      schemaVersion: 1,
      projectId: parentSession.projectId,
      sessionId: options.newSessionId,
      type: EventTypes.SESSION_FORKED,
      actor: "system",
      timestamp: now,
      payload: {
        parentSessionId: sourceSessionId,
        branch: options.branch,
        parentBranch: parentSession.branch,
      },
    };

    const committedForkEvent = this.eventStore.append(forkEvent);

    return {
      newSession: forkedSession,
      forkEvent: committedForkEvent,
    };
  }

  /**
   * Traces lineage of a session back to its root ancestor.
   */
  public getSessionAncestry(sessionId: string): Session[] {
    const ancestry: Session[] = [];
    let currentId: string | undefined = sessionId;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) {
        throw new Error(`Cyclic parent session reference detected for session '${currentId}'.`);
      }
      visited.add(currentId);

      const session = this.sessionRepo.findById(currentId);
      if (!session) break;

      ancestry.push(session);
      currentId = session.parentSessionId;
    }

    return ancestry;
  }

  /**
   * Returns a hierarchical tree representation of all sessions within a project.
   */
  public getSessionTree(projectId: string): SessionTreeNode[] {
    const allSessions = this.sessionRepo.listByProject(projectId);
    const nodeMap = new Map<string, SessionTreeNode>();

    for (const session of allSessions) {
      nodeMap.set(session.id, { session, children: [] });
    }

    const roots: SessionTreeNode[] = [];

    for (const session of allSessions) {
      const node = nodeMap.get(session.id);
      if (!node) continue;

      if (session.parentSessionId && nodeMap.has(session.parentSessionId)) {
        const parentNode = nodeMap.get(session.parentSessionId);
        parentNode?.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Lists all active distinct branches for a project.
   */
  public listBranches(projectId: string): string[] {
    const sessions = this.sessionRepo.listByProject(projectId);
    const branches = new Set<string>();
    for (const s of sessions) {
      branches.add(s.branch);
    }
    return Array.from(branches);
  }
}
