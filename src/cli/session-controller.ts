import { randomUUID } from "node:crypto";
import { type CliContext, type CliOutputMode, CliContextSchema } from "../domain/cli.js";
import { type Session } from "../domain/session.js";
import { type Project } from "../domain/project.js";
import { ProjectRepository } from "../persistence/repositories/project-repository.js";
import { SessionRepository } from "../persistence/repositories/session-repository.js";

export interface SessionControllerOptions {
  projectRepo: ProjectRepository;
  sessionRepo: SessionRepository;
  initialProjectId?: string;
  initialSessionId?: string;
  outputMode?: CliOutputMode;
}

/**
 * CLI Session Controller & Project Boundary Enforcer.
 * PRD Part 1 Section 10–20 & PRD Part 2 Section 170.
 */
export class SessionController {
  private readonly projectRepo: ProjectRepository;
  private readonly sessionRepo: SessionRepository;
  private context: CliContext;

  constructor(options: SessionControllerOptions) {
    this.projectRepo = options.projectRepo;
    this.sessionRepo = options.sessionRepo;

    this.context = CliContextSchema.parse({
      activeProjectId: options.initialProjectId,
      activeSessionId: options.initialSessionId,
      outputMode: options.outputMode ?? "text",
      correlationId: `cli_corr_${randomUUID()}`,
      user: "operator",
      metadata: {},
    });
  }

  public getContext(): CliContext {
    return { ...this.context };
  }

  public setOutputMode(mode: CliOutputMode): void {
    this.context.outputMode = mode;
  }

  public setActiveProject(projectId: string): Project {
    const project = this.projectRepo.findById(projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found.`);
    }

    this.context.activeProjectId = project.id;
    // Clear session if it belonged to another project
    if (this.context.activeSessionId) {
      const activeSession = this.sessionRepo.findById(this.context.activeSessionId);
      if (activeSession && activeSession.projectId !== project.id) {
        this.context.activeSessionId = undefined;
      }
    }

    return project;
  }

  public setActiveSession(sessionId: string): Session {
    const session = this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found.`);
    }

    // Enforce Project Tenant Boundary
    if (this.context.activeProjectId && session.projectId !== this.context.activeProjectId) {
      throw new Error(
        `Project boundary violation: Session "${sessionId}" belongs to project "${session.projectId}", but active project is "${this.context.activeProjectId}".`
      );
    }

    this.context.activeProjectId = session.projectId;
    this.context.activeSessionId = session.id;
    return session;
  }

  public createSession(name: string, modelProfile = "default"): Session {
    const projectId = this.ensureActiveProject();
    const now = new Date().toISOString();
    const sessionId = `sess_${randomUUID()}`;

    const session: Session = {
      id: sessionId,
      projectId,
      name,
      branch: "main",
      status: "active",
      modelProfile,
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };

    this.sessionRepo.save(session);
    this.context.activeSessionId = session.id;
    return session;
  }

  public ensureActiveProject(): string {
    if (!this.context.activeProjectId) {
      throw new Error("No active project selected. Use '/project select <id>' or '/project create <name>' first.");
    }
    return this.context.activeProjectId;
  }

  public ensureActiveSession(): string {
    if (!this.context.activeSessionId) {
      throw new Error("No active session selected. Use '/session select <id>' or '/session create <name>' first.");
    }
    return this.context.activeSessionId;
  }

  public listProjects(): Project[] {
    return this.projectRepo.list();
  }

  public listSessions(projectId?: string): Session[] {
    const targetProject = projectId || this.context.activeProjectId;
    if (targetProject) {
      return this.sessionRepo.listByProject(targetProject);
    }
    return [];
  }
}
