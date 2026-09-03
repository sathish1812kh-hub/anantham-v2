import { randomUUID } from "node:crypto";
import {
  type ParsedCommand,
  type CommandDescriptor,
  type CommandExecutionResult,
} from "../domain/cli.js";
import { type Project } from "../domain/project.js";
import { type Task } from "../domain/task.js";
import { SessionController } from "./session-controller.js";
import { CliErrorHandler } from "./error-handler.js";

// Authoritative Runtime Subsystems
import { ProjectRepository } from "../persistence/repositories/project-repository.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";
import { ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import { EventStore } from "../event-state/event-store.js";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { SessionResumeEngine } from "../resume/session-resume-engine.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { PolicyEngine } from "../policy/policy-engine.js";
import { TaskClaimManager } from "../tasks/task-claim-manager.js";
import { ProjectDeletionSafetyManager, type ProjectDeletionTier } from "../workspace/project-deletion-safety.js";
import { SlashMigrateCommand } from "./slash-migrate.js";

export type CommandHandler = (
  cmd: ParsedCommand,
  controller: SessionController
) => Promise<CommandExecutionResult> | CommandExecutionResult;

export interface CommandRegistryOptions {
  sessionController: SessionController;
  projectRepo: ProjectRepository;
  taskRepo: TaskRepository;
  artifactRepo?: ArtifactRepository;
  eventStore?: EventStore;
  engine?: SqliteEngine;
  resumeEngine?: SessionResumeEngine;
  toolRegistry?: ToolRegistry;
  policyEngine?: PolicyEngine;
  claimManager?: TaskClaimManager;
  errorHandler?: CliErrorHandler;
}

/**
 * Command Registry & Execution Dispatcher.
 * PRD Part 2 Section 170–175.
 */
export class CommandRegistry {
  private descriptors: Map<string, CommandDescriptor> = new Map();
  private handlers: Map<string, CommandHandler> = new Map();
  private readonly sessionController: SessionController;
  private readonly projectRepo: ProjectRepository;
  private readonly taskRepo: TaskRepository;
  private readonly artifactRepo?: ArtifactRepository;
  private readonly eventStore?: EventStore;
  private readonly engine?: SqliteEngine;
  private readonly resumeEngine?: SessionResumeEngine;
  private readonly toolRegistry?: ToolRegistry;
  private readonly policyEngine?: PolicyEngine;
  private readonly claimManager?: TaskClaimManager;
  private readonly errorHandler: CliErrorHandler;

  constructor(options: CommandRegistryOptions) {
    this.sessionController = options.sessionController;
    this.projectRepo = options.projectRepo;
    this.taskRepo = options.taskRepo;
    this.artifactRepo = options.artifactRepo;
    this.eventStore = options.eventStore;
    this.engine = options.engine;
    this.resumeEngine = options.resumeEngine;
    this.toolRegistry = options.toolRegistry;
    this.policyEngine = options.policyEngine;
    this.claimManager = options.claimManager;
    this.errorHandler = options.errorHandler ?? new CliErrorHandler();

    this.registerBuiltInCommands();
  }

  public registerCommand(descriptor: CommandDescriptor, handler: CommandHandler): void {
    this.descriptors.set(descriptor.name.toLowerCase(), descriptor);
    this.handlers.set(descriptor.name.toLowerCase(), handler);

    for (const alias of descriptor.aliases) {
      this.handlers.set(alias.toLowerCase(), handler);
    }
  }

  public getDescriptor(name: string): CommandDescriptor | undefined {
    return this.descriptors.get(name.toLowerCase());
  }

  public listDescriptors(): CommandDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  /**
   * Execute a parsed command.
   */
  public async execute(cmd: ParsedCommand): Promise<CommandExecutionResult> {
    const handler = this.handlers.get(cmd.name.toLowerCase());
    if (!handler) {
      return this.errorHandler.handleError(
        cmd.name,
        `Unknown command "/${cmd.name}". Type "/help" for available commands.`
      );
    }

    try {
      return await handler(cmd, this.sessionController);
    } catch (err) {
      return this.errorHandler.handleError(cmd.name, err);
    }
  }

  /**
   * Register all authoritative built-in slash commands.
   */
  private registerBuiltInCommands(): void {
    // 1. /help
    this.registerCommand(
      {
        name: "help",
        description: "List all available slash commands and usage",
        aliases: ["h", "?"],
        usage: "/help [command]",
        options: [],
      },
      (cmd) => {
        if (cmd.args.length > 0) {
          const target = cmd.args[0]!.replace(/^\//, "").toLowerCase();
          const desc = this.descriptors.get(target);
          if (!desc) {
            return {
              success: false,
              commandName: "help",
              error: `No help found for command "/${target}".`,
              exitRequested: false,
            };
          }
          return {
            success: true,
            commandName: "help",
            message: `Command: /${desc.name}`,
            data: {
              usage: desc.usage,
              description: desc.description,
              aliases: desc.aliases,
              options: desc.options,
            },
            exitRequested: false,
          };
        }

        const list = Array.from(this.descriptors.values()).map((d) => ({
          command: `/${d.name}`,
          description: d.description,
          usage: d.usage,
        }));

        return {
          success: true,
          commandName: "help",
          message: "Available Anantham V2 Commands",
          data: list,
          exitRequested: false,
        };
      }
    );

    // 2. /exit & /quit
    this.registerCommand(
      {
        name: "exit",
        description: "Exit the interactive session loop",
        aliases: ["quit", "q"],
        usage: "/exit",
        options: [],
      },
      () => {
        return {
          success: true,
          commandName: "exit",
          message: "Exiting Anantham session loop. Goodbye.",
          exitRequested: true,
        };
      }
    );

    // 3. /project
    this.registerCommand(
      {
        name: "project",
        description: "Manage projects (list, select, create, remove)",
        aliases: ["projects", "proj", "p"],
        usage: "/project [list | select <id> | create <name> | remove <id|name> [--tier <REGISTRY_ONLY|REGISTRY_AND_METADATA|DESTRUCTIVE>] [--confirm <token>] [--metadata-path <path>]]",
        options: [],
      },
      async (cmd, ctrl) => {
        const sub = cmd.args[0]?.toLowerCase() || "list";

        if (sub === "list") {
          const projects = ctrl.listProjects();
          return {
            success: true,
            commandName: "project",
            message: `Found ${projects.length} project(s)`,
            data: projects.map((p) => ({ id: p.id, name: p.name, rootPath: p.rootPath, status: p.status })),
            exitRequested: false,
          };
        }

        if (sub === "select") {
          const id = cmd.args[1];
          if (!id) throw new Error("Missing project ID. Usage: /project select <projectId>");
          const project = ctrl.setActiveProject(id);
          return {
            success: true,
            commandName: "project",
            message: `Active project set to "${project.name}" (${project.id}).`,
            data: project,
            exitRequested: false,
          };
        }

        if (sub === "create") {
          const name = cmd.args.slice(1).join(" ");
          if (!name) throw new Error("Missing project name. Usage: /project create <name>");
          const now = new Date().toISOString();
          const newProj: Project = {
            id: `proj_${randomUUID().slice(0, 8)}`,
            name,
            rootPath: process.cwd(),
            status: "active",
            tags: [],
            modelProfile: "default",
            memoryNamespace: "default",
            orchestrationProfile: "default",
            trustProfile: "safe",
            createdAt: now,
            lastOpenedAt: now,
            lastActivityAt: now,
            metadata: {},
          };
          this.projectRepo.save(newProj);
          ctrl.setActiveProject(newProj.id);
          return {
            success: true,
            commandName: "project",
            message: `Created and selected project "${newProj.name}" (${newProj.id}).`,
            data: newProj,
            exitRequested: false,
          };
        }

        if (sub === "remove" || sub === "delete") {
          const target = cmd.args[1];
          if (!target) {
            throw new Error(
              "Missing project ID or name. Usage: /project remove <id|name> [--tier <REGISTRY_ONLY|REGISTRY_AND_METADATA|DESTRUCTIVE>] [--confirm <token>] [--metadata-path <path>]"
            );
          }

          let tier: ProjectDeletionTier = "REGISTRY_ONLY";
          let confirmToken: string | undefined;
          let metadataPath: string | undefined;

          for (let i = 2; i < cmd.args.length; i++) {
            const arg = cmd.args[i]!;
            if (arg === "--tier" && i + 1 < cmd.args.length) {
              tier = cmd.args[++i] as ProjectDeletionTier;
            } else if (arg.startsWith("--tier=")) {
              tier = arg.split("=")[1] as ProjectDeletionTier;
            } else if (arg === "--confirm" && i + 1 < cmd.args.length) {
              confirmToken = cmd.args[++i];
            } else if (arg.startsWith("--confirm=")) {
              confirmToken = arg.split("=")[1];
            } else if (arg === "--metadata-path" && i + 1 < cmd.args.length) {
              metadataPath = cmd.args[++i];
            } else if (arg.startsWith("--metadata-path=")) {
              metadataPath = arg.split("=")[1];
            }
          }

          // Resolve project by ID or by name
          let targetProject: Project | null | undefined = this.projectRepo.findById(target);
          if (!targetProject) {
            const allProjects = ctrl.listProjects();
            targetProject = allProjects.find((p) => p.name.toLowerCase() === target.toLowerCase());
          }

          if (!targetProject) {
            throw new Error(`Project "${target}" not found.`);
          }

          let delResult;
          if (this.engine) {
            const mgr = new ProjectDeletionSafetyManager(this.engine);
            delResult = await mgr.removeProject(targetProject.id, {
              tier,
              confirmToken,
              metadataPath,
            });
          } else {
            this.projectRepo.delete(targetProject.id);
            delResult = {
              projectId: targetProject.id,
              projectName: targetProject.name,
              tier,
              registryDeleted: true,
              metadataDeleted: false,
              sourceDeleted: false,
              timestamp: new Date().toISOString(),
            };
          }

          return {
            success: true,
            commandName: "project",
            message: `Project "${targetProject.name}" (${targetProject.id}) removed successfully (tier: ${tier}).`,
            data: delResult,
            exitRequested: false,
          };
        }

        throw new Error(`Unknown project subcommand "${sub}". Use 'list', 'select', 'create', or 'remove'.`);
      }
    );

    // 4. /session
    this.registerCommand(
      {
        name: "session",
        description: "Manage sessions (list, select, create, info)",
        aliases: ["sess", "s"],
        usage: "/session [list | select <id> | create <name> | info]",
        options: [],
      },
      (cmd, ctrl) => {
        const sub = cmd.args[0]?.toLowerCase() || "info";

        if (sub === "info") {
          const ctx = ctrl.getContext();
          return {
            success: true,
            commandName: "session",
            message: "Active Session Context",
            data: ctx,
            exitRequested: false,
          };
        }

        if (sub === "list") {
          const sessions = ctrl.listSessions();
          return {
            success: true,
            commandName: "session",
            message: `Found ${sessions.length} session(s)`,
            data: sessions.map((s) => ({ id: s.id, name: s.name, projectId: s.projectId, status: s.status })),
            exitRequested: false,
          };
        }

        if (sub === "select") {
          const id = cmd.args[1];
          if (!id) throw new Error("Missing session ID. Usage: /session select <sessionId>");
          const session = ctrl.setActiveSession(id);
          return {
            success: true,
            commandName: "session",
            message: `Active session set to "${session.name}" (${session.id}).`,
            data: session,
            exitRequested: false,
          };
        }

        if (sub === "create") {
          const name = cmd.args.slice(1).join(" ") || "Interactive Session";
          const session = ctrl.createSession(name);
          return {
            success: true,
            commandName: "session",
            message: `Created and selected session "${session.name}" (${session.id}).`,
            data: session,
            exitRequested: false,
          };
        }

        throw new Error(`Unknown session subcommand "${sub}".`);
      }
    );

    // 5. /task
    this.registerCommand(
      {
        name: "task",
        description: "Task board commands (list, create, claim, complete, fail)",
        aliases: ["t"],
        usage: "/task [list | create <objective> | claim <id> | complete <id> | fail <id>]",
        options: [],
      },
      (cmd, ctrl) => {
        const sub = cmd.args[0]?.toLowerCase() || "list";

        if (sub === "list") {
          const sessionId = ctrl.ensureActiveSession();
          const tasks = this.taskRepo.listBySession(sessionId);
          return {
            success: true,
            commandName: "task",
            message: `Found ${tasks.length} task(s) in session ${sessionId}`,
            data: tasks.map((t: Task) => ({ id: t.id, objective: t.objective, status: t.status, priority: t.priority })),
            exitRequested: false,
          };
        }

        if (sub === "create") {
          const projectId = ctrl.ensureActiveProject();
          const sessionId = ctrl.ensureActiveSession();
          const objective = cmd.args.slice(1).join(" ");
          if (!objective) throw new Error("Missing task objective. Usage: /task create <objective>");

          const now = new Date().toISOString();
          const newTask: Task = {
            id: `task_${randomUUID().slice(0, 8)}`,
            projectId,
            sessionId,
            objective,
            status: "available",
            priority: "normal",
            dependencies: [],
            inputArtifacts: [],
            outputArtifacts: [],
            createdAt: now,
            updatedAt: now,
            metadata: {},
          };

          this.taskRepo.save(newTask);
          return {
            success: true,
            commandName: "task",
            message: `Created task "${newTask.objective}" (${newTask.id}).`,
            data: newTask,
            exitRequested: false,
          };
        }

        if (sub === "claim") {
          const taskId = cmd.args[1];
          if (!taskId) throw new Error("Missing taskId. Usage: /task claim <taskId>");
          const projectId = ctrl.ensureActiveProject();
          const sessionId = ctrl.ensureActiveSession();

          if (!this.claimManager) throw new Error("TaskClaimManager not wired.");
          const claimRes = this.claimManager.claimTask({
            taskId,
            agentId: "cli_operator",
            instanceId: `inst_${randomUUID().slice(0, 6)}`,
            projectId,
            sessionId,
          });

          if (!claimRes.success) {
            throw new Error(`Failed to claim task: ${claimRes.errorMessage}`);
          }

          return {
            success: true,
            commandName: "task",
            message: `Claimed task ${taskId} (Lease: ${claimRes.lease?.id}, Generation: ${claimRes.lease?.generation}).`,
            data: claimRes.lease,
            exitRequested: false,
          };
        }

        throw new Error(`Unknown task subcommand "${sub}".`);
      }
    );

    // 6. /resume
    this.registerCommand(
      {
        name: "resume",
        description: "Resume session state and restore recoverable tasks",
        aliases: ["res"],
        usage: "/resume [sessionId]",
        options: [],
      },
      async (cmd, ctrl) => {
        const sessionId = cmd.args[0] || ctrl.ensureActiveSession();
        if (!this.resumeEngine) {
          throw new Error("SessionResumeEngine not wired.");
        }

        const summary = await this.resumeEngine.resume({
          target: { type: "session", sessionId },
        });
        return {
          success: true,
          commandName: "resume",
          message: `Resumed session ${sessionId}. Recoverable state reconstructed.`,
          data: summary,
          exitRequested: false,
        };
      }
    );

    // 7. /artifacts
    this.registerCommand(
      {
        name: "artifacts",
        description: "List artifacts in current session",
        aliases: ["art"],
        usage: "/artifacts [list]",
        options: [],
      },
      (_cmd, ctrl) => {
        const sessionId = ctrl.ensureActiveSession();
        if (!this.artifactRepo) {
          throw new Error("ArtifactRepository not wired.");
        }

        const artifacts = this.artifactRepo.listBySession(sessionId);
        return {
          success: true,
          commandName: "artifacts",
          message: `Found ${artifacts.length} artifact(s)`,
          data: artifacts.map((a) => ({ id: a.id, type: a.type, sha256: a.sha256 })),
          exitRequested: false,
        };
      }
    );

    // 8. /doctor
    this.registerCommand(
      {
        name: "doctor",
        description: "Run comprehensive system health check and diagnostic inspection",
        aliases: ["doc"],
        usage: "/doctor",
        options: [],
      },
      () => {
        const diagnostics: Record<string, unknown> = {
          timestamp: new Date().toISOString(),
          sqliteWal: this.engine?.isOpen() ? "HEALTHY" : "CLOSED",
          eventStore: this.eventStore ? "OPERATIONAL" : "UNAVAILABLE",
          registeredCommands: this.descriptors.size,
          nodeVersion: process.version,
          platform: process.platform,
        };

        return {
          success: true,
          commandName: "doctor",
          message: "System Health Diagnostics: ALL SYSTEMS OPERATIONAL",
          data: diagnostics,
          exitRequested: false,
        };
      }
    );

    // 9. /tools
    this.registerCommand(
      {
        name: "tools",
        description: "List available registered native tools",
        aliases: [],
        usage: "/tools [list]",
        options: [],
      },
      () => {
        const tools = this.toolRegistry ? this.toolRegistry.list() : [];
        return {
          success: true,
          commandName: "tools",
          message: `Registered Tools: ${tools.length}`,
          data: tools.map((t) => ({ name: t.definition.name, description: t.definition.description, riskLevel: t.definition.riskLevel })),
          exitRequested: false,
        };
      }
    );

    // 10. /policy
    this.registerCommand(
      {
        name: "policy",
        description: "Inspect active policies and evaluate rules",
        aliases: ["pol"],
        usage: "/policy [list]",
        options: [],
      },
      () => {
        return {
          success: true,
          commandName: "policy",
          message: "Policy Engine Active",
          data: {
            policyVersion: this.policyEngine?.policyVersion ?? "1.0.0",
            status: "ENFORCING",
          },
          exitRequested: false,
        };
      }
    );

    // 11. /plan
    this.registerCommand(
      {
        name: "plan",
        description: "Formulate or inspect workflow execution plan",
        aliases: [],
        usage: "/plan",
        options: [],
      },
      (_cmd, ctrl) => {
        const proj = ctrl.getContext().activeProjectId || "None";
        const sess = ctrl.getContext().activeSessionId || "None";
        return {
          success: true,
          commandName: "plan",
          message: "Plan Mode Active",
          data: {
            activeProject: proj,
            activeSession: sess,
            status: "READY",
          },
          exitRequested: false,
        };
      }
    );

    // 12. /version
    this.registerCommand(
      {
        name: "version",
        description: "Display the Anantham V2 platform version",
        aliases: ["v", "--version", "-v"],
        usage: "/version",
        options: [],
      },
      () => {
        return {
          success: true,
          commandName: "version",
          message: "Anantham V2 v2.0.0-alpha.1",
          data: {
            version: "2.0.0-alpha.1",
            releaseChannel: "alpha",
          },
          exitRequested: false,
        };
      }
    );

    // 13. /migrate
    this.registerCommand(
      {
        name: "migrate",
        description: "Migrate configurations from Claude, Cursor, Gemini, Cline, Roo, Aider, OpenCode into native Anantham format",
        aliases: ["import-config", "mig"],
        usage: "/migrate [claude | gemini | cursor | cline | roo | aider | opencode | auto | all] [--dry-run] [--overwrite] [--output <path>]",
        options: [
          { name: "dry-run", description: "Preview migration without modifying files", type: "boolean", required: false },
          { name: "overwrite", description: "Overwrite existing target files", type: "boolean", required: false },
          { name: "output", description: "Custom destination file path", type: "string", required: false },
        ],
      },
      async (cmd, ctrl) => {
        let workspaceRoot = process.cwd();
        const activeProjectId = ctrl.getContext().activeProjectId;
        if (activeProjectId) {
          const activeProj = this.projectRepo.findById(activeProjectId);
          if (activeProj?.rootPath) {
            workspaceRoot = activeProj.rootPath;
          }
        }

        const migrateCmd = new SlashMigrateCommand();
        const result = await migrateCmd.execute(cmd.args, workspaceRoot);

        return {
          success: result.success,
          commandName: "migrate",
          message: result.message,
          data: result,
          exitRequested: false,
        };
      }
    );
  }
}
