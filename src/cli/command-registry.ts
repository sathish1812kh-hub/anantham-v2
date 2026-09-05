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
import { maskSecret } from "../models/secret-store.js";
import { UserConfigManager } from "../persistence/user-config-manager.js";

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

export interface ModelEntry {
  id: string;
  provider: string;
  isCustom?: boolean;
}

export const CURATED_MODELS_BY_PROVIDER: Record<string, string[]> = {
  openrouter: [
    "openrouter/anthropic/claude-3.5-sonnet",
    "openrouter/deepseek/deepseek-r1",
    "openrouter/openai/gpt-4o",
    "openrouter/google/gemini-2.5-pro",
    "openrouter/meta-llama/llama-3.3-70b-instruct",
    "openrouter/qwen/qwen-2.5-coder-32b-instruct",
  ],
  anthropic: [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "o1",
    "o3-mini",
  ],
  gemini: [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash-thinking-exp",
  ],
  groq: [
    "groq/llama-3.3-70b-versatile",
    "groq/deepseek-r1-distill-llama-70b",
  ],
  deepseek: [
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  ollama: [
    "ollama/llama3.2",
    "ollama/mistral",
    "ollama/qwen2.5-coder",
  ],
};

export function getNumberedModelList(configMgr: UserConfigManager): ModelEntry[] {
  const result: ModelEntry[] = [];
  const configuredProviders = configMgr
    .listKeys()
    .filter((k) => k.configured)
    .map((k) => k.provider);

  // 1. Prioritize models for configured providers
  for (const prov of configuredProviders) {
    const list = CURATED_MODELS_BY_PROVIDER[prov] || [];
    for (const id of list) {
      if (!result.some((r) => r.id === id)) {
        result.push({ id, provider: prov });
      }
    }
  }

  // 2. Custom models
  for (const customId of configMgr.getCustomModels()) {
    if (!result.some((r) => r.id === customId)) {
      result.push({ id: customId, provider: "custom", isCustom: true });
    }
  }

  // 3. Fallback default models if no keys configured
  if (result.length === 0) {
    const defaultOrder = ["openrouter", "gemini", "anthropic", "openai"];
    for (const prov of defaultOrder) {
      const list = CURATED_MODELS_BY_PROVIDER[prov] || [];
      for (const id of list.slice(0, 2)) {
        if (!result.some((r) => r.id === id)) {
          result.push({ id, provider: prov });
        }
      }
    }
  }

  return result;
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

        const formatted = list.map((c) => `  ${c.command.padEnd(14)} — ${c.description}`).join("\n");

        return {
          success: true,
          commandName: "help",
          message: `Available Anantham V2 Commands:\n${formatted}`,
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
          message: "Anantham V2 v2.0.2",
          data: {
            version: "2.0.2",
            releaseChannel: "release",
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

    // 14. /key & /connect
    this.registerCommand(
      {
        name: "key",
        description: "Manage provider API keys (list, set <provider> <key>, remove <provider>)",
        aliases: ["keys", "apikey", "connect"],
        usage: "/key [list | set <provider> <key> | remove <provider>]",
        options: [],
      },
      (cmd, ctrl) => {
        let sub = cmd.args[0]?.toLowerCase() || "list";
        let providerArg = cmd.args[1];
        let keyArg = cmd.args[2];

        // Support direct /connect openrouter sk-... or /connect <provider>
        if (cmd.name.toLowerCase() === "connect") {
          sub = "set";
          providerArg = cmd.args[0];
          keyArg = cmd.args[1];
        }

        const configMgr = UserConfigManager.getInstance();
        let workspaceDir = process.cwd();
        const activeProjectId = ctrl.getContext().activeProjectId;
        if (activeProjectId) {
          const proj = this.projectRepo.findById(activeProjectId);
          if (proj?.rootPath) {
            workspaceDir = proj.rootPath;
          }
        }

        if (sub === "set") {
          const provider = providerArg?.toLowerCase();
          const key = keyArg;
          if (!provider || !key) {
            throw new Error("Usage: /key set <provider> <apiKey> (e.g. /key set openrouter sk-or-v1-...)");
          }
          configMgr.setApiKey(provider, key, workspaceDir);
          const envVar = `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
          return {
            success: true,
            commandName: "key",
            message: `✔ API key for provider '${provider}' connected successfully!\n  Variable: ${envVar} = ${maskSecret(key)}\n  Saved to ~/.anantham/config.json and workspace .env`,
            data: { provider, envVar, maskedKey: maskSecret(key) },
            exitRequested: false,
          };
        }

        if (sub === "remove" || sub === "delete") {
          const provider = providerArg?.toLowerCase();
          if (!provider) {
            throw new Error("Usage: /key remove <provider>");
          }
          configMgr.removeApiKey(provider, workspaceDir);
          return {
            success: true,
            commandName: "key",
            message: `✔ API key for provider '${provider}' removed from config and environment.`,
            data: { provider },
            exitRequested: false,
          };
        }

        if (sub === "list") {
          const list = configMgr.listKeys();
          const rows = list.map(
            (c) => `  ${c.provider.padEnd(12)} : ${c.masked.padEnd(16)} [${c.configured ? "✔ Configured" : "✖ Not Set"}]`
          );
          return {
            success: true,
            commandName: "key",
            message: `Configured AI Provider Keys:\n${rows.join("\n")}\n\nUse: /key set <provider> <apiKey> to connect a provider.`,
            data: list,
            exitRequested: false,
          };
        }

        throw new Error(`Unknown key subcommand '${sub}'. Use 'list', 'set <provider> <key>', or 'remove <provider>'.`);
      }
    );

    // 15. /model
    this.registerCommand(
      {
        name: "model",
        description: "Display, switch, or add active LLM models (supports /model <number>, /model add <id>)",
        aliases: ["m"],
        usage: "/model [<number> | <modelId> | add <modelId> | remove <modelId>]",
        options: [],
      },
      (cmd, ctrl) => {
        const configMgr = UserConfigManager.getInstance();
        const activeProjectId = ctrl.getContext().activeProjectId;
        const proj = activeProjectId ? this.projectRepo.findById(activeProjectId) : null;
        const currentModel = proj?.modelProfile || configMgr.getDefaultModel();

        if (cmd.args.length === 0) {
          return {
            success: true,
            commandName: "model",
            message: `Current active model: ${currentModel}\n\nQuick switch: /model <number> (e.g. /model 1)\nAdd custom:   /model add <modelId>\nList models:  /models`,
            data: { model: currentModel },
            exitRequested: false,
          };
        }

        const sub = cmd.args[0]!.toLowerCase();

        // /model add <modelId>
        if (sub === "add") {
          const modelId = cmd.args[1]?.trim();
          if (!modelId) {
            throw new Error("Usage: /model add <modelId> (e.g. /model add openrouter/mistralai/mistral-large)");
          }
          configMgr.addCustomModel(modelId);
          configMgr.setDefaultModel(modelId);
          if (proj) {
            proj.modelProfile = modelId;
            this.projectRepo.save(proj);
          }
          return {
            success: true,
            commandName: "model",
            message: `✔ Added custom model '${modelId}' and switched to it.\n  Saved to ~/.anantham/config.json and active project.`,
            data: { model: modelId, custom: true },
            exitRequested: false,
          };
        }

        // /model remove <modelId>
        if (sub === "remove" || sub === "delete") {
          const modelId = cmd.args[1]?.trim();
          if (!modelId) {
            throw new Error("Usage: /model remove <modelId>");
          }
          const removed = configMgr.removeCustomModel(modelId);
          return {
            success: true,
            commandName: "model",
            message: removed
              ? `✔ Removed custom model '${modelId}'.`
              : `Model '${modelId}' was not in custom models list.`,
            data: { model: modelId, removed },
            exitRequested: false,
          };
        }

        let targetModel = cmd.args[0]!.trim();

        // Check if numeric selection (e.g. /model 1 or /model 2)
        if (/^\d+$/.test(targetModel)) {
          const num = parseInt(targetModel, 10);
          const list = getNumberedModelList(configMgr);
          if (num < 1 || num > list.length) {
            throw new Error(`Invalid model index [${num}]. Run '/models' to view available numbers (1-${list.length}).`);
          }
          targetModel = list[num - 1]!.id;
        }

        configMgr.setDefaultModel(targetModel);
        if (proj) {
          proj.modelProfile = targetModel;
          this.projectRepo.save(proj);
        }

        return {
          success: true,
          commandName: "model",
          message: `✔ Active model switched to '${targetModel}' (persisted to config & project).`,
          data: { model: targetModel },
          exitRequested: false,
        };
      }
    );

    // 16. /models
    this.registerCommand(
      {
        name: "models",
        description: "List curated AI models, search OpenRouter models, or list by provider",
        aliases: ["model-list"],
        usage: "/models [all | <provider> | search <query> | fetch]",
        options: [],
      },
      async (cmd, ctrl) => {
        const configMgr = UserConfigManager.getInstance();
        const activeProjectId = ctrl.getContext().activeProjectId;
        const proj = activeProjectId ? this.projectRepo.findById(activeProjectId) : null;
        const activeModel = proj?.modelProfile || configMgr.getDefaultModel();

        const arg = cmd.args[0]?.toLowerCase();

        // /models search <query> or /models fetch
        if (arg === "search" || arg === "fetch") {
          const query = cmd.args.slice(1).join(" ").toLowerCase();
          const orKey = configMgr.getApiKey("openrouter");
          if (!orKey) {
            throw new Error("OpenRouter API key required to search live models. Connect it with: /key set openrouter <key>");
          }
          try {
            const res = await fetch("https://openrouter.ai/api/v1/models", {
              headers: { Authorization: `Bearer ${orKey}` },
              signal: AbortSignal.timeout(6000),
            });
            if (!res.ok) {
              throw new Error(`OpenRouter API responded with HTTP ${res.status}`);
            }
            const data = (await res.json()) as { data?: Array<{ id: string; name?: string; context_length?: number }> };
            let items = data.data || [];
            if (query) {
              items = items.filter(
                (m) => m.id.toLowerCase().includes(query) || (m.name && m.name.toLowerCase().includes(query))
              );
            }
            const matched = items.slice(0, 8);
            if (matched.length === 0) {
              return {
                success: true,
                commandName: "models",
                message: `No OpenRouter models found matching '${query}'.`,
                data: [],
                exitRequested: false,
              };
            }
            const lines = matched.map(
              (m) => `  • ${m.id} (${m.context_length ? `${Math.round(m.context_length / 1000)}k ctx` : "std"})`
            );
            return {
              success: true,
              commandName: "models",
              message: `OpenRouter Live Models${query ? ` (search: '${query}')` : " (top)"}:\n${lines.join("\n")}\n\nTo use: /model <modelId> or /model add <modelId>`,
              data: matched.map((m) => m.id),
              exitRequested: false,
            };
          } catch (err: any) {
            throw new Error(`Failed to query OpenRouter live models: ${err.message}`);
          }
        }

        // /models all
        if (arg === "all") {
          const sections: string[] = [];
          for (const [provider, models] of Object.entries(CURATED_MODELS_BY_PROVIDER)) {
            sections.push(`[${provider.toUpperCase()}]:\n` + models.slice(0, 3).map((m) => `  • ${m}`).join("\n"));
          }
          return {
            success: true,
            commandName: "models",
            message: `Curated AI Models Catalog:\n\n${sections.join("\n\n")}\n\nSwitch via: /model <modelId>`,
            data: CURATED_MODELS_BY_PROVIDER,
            exitRequested: false,
          };
        }

        // Specific provider e.g. /models anthropic or /models openrouter
        if (arg && CURATED_MODELS_BY_PROVIDER[arg]) {
          const list = CURATED_MODELS_BY_PROVIDER[arg]!.map((m) => {
            const activeTag = m === activeModel ? " (ACTIVE)" : "";
            return `  • ${m}${activeTag}`;
          }).join("\n");
          return {
            success: true,
            commandName: "models",
            message: `Models for [${arg.toUpperCase()}]:\n${list}\n\nSwitch via: /model <modelId>`,
            data: CURATED_MODELS_BY_PROVIDER[arg],
            exitRequested: false,
          };
        }

        // Default: List models for configured providers + custom models
        const configuredKeys = configMgr.listKeys().filter((k) => k.configured);
        const list = getNumberedModelList(configMgr);

        if (configuredKeys.length > 0) {
          const provNames = configuredKeys.map((k) => k.provider.toUpperCase()).join(", ");
          const rows = list.map((item, idx) => {
            const num = `[${idx + 1}]`.padEnd(4);
            const isActive = item.id === activeModel ? " (ACTIVE)" : "";
            const customTag = item.isCustom ? " [Custom]" : "";
            return `  ${num} ${item.id}${customTag}${isActive}`;
          });

          return {
            success: true,
            commandName: "models",
            message: `Available Models for Configured Providers (${provNames}):\n${rows.join("\n")}\n\nSwitch: /model <number> (e.g. /model 1) | /model <modelId>\nCustom: /model add <id> | Search: /models search <query>`,
            data: list,
            exitRequested: false,
          };
        }

        // Fallback when no keys configured
        const fallbackRows = list.map((item, idx) => {
          const num = `[${idx + 1}]`.padEnd(4);
          const isActive = item.id === activeModel ? " (ACTIVE)" : "";
          return `  ${num} ${item.id} [${item.provider}]${isActive}`;
        });

        return {
          success: true,
          commandName: "models",
          message: `Curated AI Models (No API keys configured yet):\n${fallbackRows.join("\n")}\n\nConnect OpenRouter or other keys via:\n  /key set openrouter <your-api-key>\nSwitch: /model <number> | View all: /models all`,
          data: list,
          exitRequested: false,
        };
      }
    );
  }
}
