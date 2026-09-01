import {
  type IdeProtocolMessage,
  IdeProtocolMessageSchema,
} from "../domain/integration.js";
import { type TaskRepository } from "../persistence/repositories/task-repository.js";
import { type ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import { type ProjectRepository } from "../persistence/repositories/project-repository.js";
import { type SessionRepository } from "../persistence/repositories/session-repository.js";
import { type CommandRegistry } from "../cli/command-registry.js";
import { CommandParser } from "../cli/command-parser.js";

export interface IdeAdapterOptions {
  projectRepo: ProjectRepository;
  sessionRepo: SessionRepository;
  taskRepo: TaskRepository;
  artifactRepo: ArtifactRepository;
  commandRegistry?: CommandRegistry;
}

/**
 * IDE / Editor Integration Protocol Adapter.
 * PRD Part 2 Section 245.
 */
export class IdeAdapter {
  private readonly projectRepo: ProjectRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly taskRepo: TaskRepository;
  private readonly artifactRepo: ArtifactRepository;
  private readonly commandRegistry?: CommandRegistry;
  private readonly parser = new CommandParser();

  constructor(options: IdeAdapterOptions) {
    this.projectRepo = options.projectRepo;
    this.sessionRepo = options.sessionRepo;
    this.taskRepo = options.taskRepo;
    this.artifactRepo = options.artifactRepo;
    this.commandRegistry = options.commandRegistry;
  }

  /**
   * Handle incoming JSON-RPC IDE protocol message.
   */
  public async handleMessage(
    rawMessage: unknown
  ): Promise<{ requestId: string; success: boolean; result?: unknown; error?: string }> {
    let msg: IdeProtocolMessage;
    try {
      msg = IdeProtocolMessageSchema.parse(rawMessage);
    } catch (err: any) {
      return { requestId: "unknown", success: false, error: `Invalid IDE protocol message: ${err.message}` };
    }

    try {
      switch (msg.method) {
        case "diagnostics.get": {
          const project = this.projectRepo.findById(msg.projectId);
          const sessions = this.sessionRepo.listByProject(msg.projectId);
          return {
            requestId: msg.requestId,
            success: true,
            result: {
              status: "connected",
              project: project?.name ?? msg.projectId,
              activeSessions: sessions.length,
            },
          };
        }

        case "tasks.list": {
          if (!msg.sessionId) {
            throw new Error("Missing required 'sessionId' for tasks.list");
          }
          const tasks = this.taskRepo.listBySession(msg.sessionId);
          return {
            requestId: msg.requestId,
            success: true,
            result: tasks,
          };
        }

        case "artifacts.get": {
          if (!msg.sessionId) {
            throw new Error("Missing required 'sessionId' for artifacts.get");
          }
          const artifacts = this.artifactRepo.listBySession(msg.sessionId);
          return {
            requestId: msg.requestId,
            success: true,
            result: artifacts,
          };
        }

        case "commands.execute": {
          if (!this.commandRegistry) {
            throw new Error("CommandRegistry unavailable in IDE adapter");
          }
          const cmdLine = String(msg.params.command ?? "");
          const parsed = this.parser.parse(cmdLine);
          const execRes = await this.commandRegistry.execute(parsed);
          return {
            requestId: msg.requestId,
            success: execRes.success,
            result: execRes.data ?? execRes.message,
            error: execRes.error,
          };
        }


        default:
          return {
            requestId: msg.requestId,
            success: true,
            result: [],
          };
      }
    } catch (err: any) {
      return {
        requestId: msg.requestId,
        success: false,
        error: err.message,
      };
    }
  }
}
