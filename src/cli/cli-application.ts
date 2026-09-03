import { type Readable, type Writable } from "node:stream";
import { type CliOutputMode, type CommandExecutionResult } from "../domain/cli.js";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { MigrationEngine } from "../persistence/migration-engine.js";
import { ProjectRepository } from "../persistence/repositories/project-repository.js";
import { SessionRepository } from "../persistence/repositories/session-repository.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";
import { LeaseRepository } from "../persistence/repositories/lease-repository.js";
import { ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import { EventStore } from "../event-state/event-store.js";
import { TaskClaimManager } from "../tasks/task-claim-manager.js";
import { PolicyEngine } from "../policy/policy-engine.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { SessionResumeEngine } from "../resume/session-resume-engine.js";
import { CrashRecoveryEngine } from "../recovery/crash-recovery-engine.js";

import { CheckpointRepository } from "../persistence/repositories/checkpoint-repository.js";
import { EventRepository } from "../persistence/repositories/event-repository.js";
import { registerNativeTools } from "../tools/native/register-native-tools.js";

import { CommandParser } from "./command-parser.js";
import { OutputRenderer } from "./output-renderer.js";
import { CliErrorHandler } from "./error-handler.js";
import { SessionController } from "./session-controller.js";
import { CommandRegistry } from "./command-registry.js";
import { SignalHandler } from "./signal-handler.js";
import { InteractiveSessionLoop } from "./interactive-session-loop.js";

export interface CliApplicationOptions {
  dbPath?: string;
  outputMode?: CliOutputMode;
  initialProjectId?: string;
  initialSessionId?: string;
}

/**
 * Anantham V2 CLI Application Container.
 * PRD Part 2 Section 170–180.
 */
export class CliApplication {
  public readonly engine: SqliteEngine;
  public readonly projectRepo: ProjectRepository;
  public readonly sessionRepo: SessionRepository;
  public readonly taskRepo: TaskRepository;
  public readonly leaseRepo: LeaseRepository;
  public readonly artifactRepo: ArtifactRepository;
  public readonly eventStore: EventStore;
  public readonly checkpointRepo: CheckpointRepository;
  public readonly eventRepo: EventRepository;
  public readonly claimManager: TaskClaimManager;
  public readonly policyEngine: PolicyEngine;
  public readonly toolRegistry: ToolRegistry;
  public readonly resumeEngine: SessionResumeEngine;
  public readonly recoveryEngine: CrashRecoveryEngine;

  public readonly parser: CommandParser;
  public readonly renderer: OutputRenderer;
  public readonly errorHandler: CliErrorHandler;
  public readonly sessionController: SessionController;
  public readonly commandRegistry: CommandRegistry;
  public readonly signalHandler: SignalHandler;

  private isInitialized = false;

  constructor(options: CliApplicationOptions = {}) {
    const dbPath = options.dbPath ?? ":memory:";
    this.engine = new SqliteEngine({ path: dbPath });

    this.projectRepo = new ProjectRepository(this.engine);
    this.sessionRepo = new SessionRepository(this.engine);
    this.taskRepo = new TaskRepository(this.engine);
    this.leaseRepo = new LeaseRepository(this.engine);
    this.artifactRepo = new ArtifactRepository(this.engine);
    this.checkpointRepo = new CheckpointRepository(this.engine);
    this.eventRepo = new EventRepository(this.engine);
    this.eventStore = new EventStore(this.engine);

    this.claimManager = new TaskClaimManager({
      engine: this.engine,
      taskRepo: this.taskRepo,
      leaseRepo: this.leaseRepo,
      eventStore: this.eventStore,
    });

    this.policyEngine = new PolicyEngine();
    this.toolRegistry = new ToolRegistry();

    this.recoveryEngine = new CrashRecoveryEngine({
      engine: this.engine,
      eventStore: this.eventStore,
      checkpointRepo: this.checkpointRepo,
      artifactRepo: this.artifactRepo,
    });

    this.resumeEngine = new SessionResumeEngine({
      engine: this.engine,
      projectRepo: this.projectRepo,
      sessionRepo: this.sessionRepo,
      taskRepo: this.taskRepo,
      checkpointRepo: this.checkpointRepo,
      artifactRepo: this.artifactRepo,
      eventRepo: this.eventRepo,
      eventStore: this.eventStore,
    });

    this.parser = new CommandParser();
    this.renderer = new OutputRenderer({ mode: options.outputMode ?? "text" });
    this.errorHandler = new CliErrorHandler();

    this.sessionController = new SessionController({
      projectRepo: this.projectRepo,
      sessionRepo: this.sessionRepo,
      initialProjectId: options.initialProjectId,
      initialSessionId: options.initialSessionId,
      outputMode: options.outputMode ?? "text",
    });

    this.commandRegistry = new CommandRegistry({
      sessionController: this.sessionController,
      projectRepo: this.projectRepo,
      taskRepo: this.taskRepo,
      artifactRepo: this.artifactRepo,
      eventStore: this.eventStore,
      engine: this.engine,
      resumeEngine: this.resumeEngine,
      toolRegistry: this.toolRegistry,
      policyEngine: this.policyEngine,
      claimManager: this.claimManager,
      errorHandler: this.errorHandler,
    });

    this.signalHandler = new SignalHandler();
  }

  /**
   * Initialize runtime services, execute database migrations, and perform startup recovery.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.engine.open();
    const migrator = new MigrationEngine(this.engine);
    migrator.migrate();

    // Register native tools for CLI session
    registerNativeTools(this.toolRegistry);

    // Perform startup recovery check
    try {
      await this.recoveryEngine.executeRecovery();
    } catch {
      // Non-blocking on empty DB
    }

    this.signalHandler.attach();
    this.isInitialized = true;
  }

  /**
   * Execute a single command string in headless or scripted mode.
   */
  public async executeSingleCommand(rawInput: string): Promise<CommandExecutionResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const parsed = this.parser.parse(rawInput);
      return await this.commandRegistry.execute(parsed);
    } catch (err) {
      return this.errorHandler.handleError("cli", err);
    }
  }

  /**
   * Start the interactive REPL loop.
   */
  public async startInteractive(input?: Readable, output?: Writable): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const loop = new InteractiveSessionLoop({
      parser: this.parser,
      registry: this.commandRegistry,
      renderer: this.renderer,
      controller: this.sessionController,
      errorHandler: this.errorHandler,
      input,
      output,
    });

    await loop.run();
  }

  /**
   * Graceful shutdown of CLI runtime.
   */
  public shutdown(): void {
    this.signalHandler.detach();
    if (this.engine.isOpen()) {
      this.engine.close();
    }
    this.isInitialized = false;
  }
}
