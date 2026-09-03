import { Readable, Writable } from "node:stream";
import { SqliteEngine } from "../persistence/sqlite-engine.js";
import { MigrationEngine } from "../persistence/migration-engine.js";
import { ProjectRepository } from "../persistence/repositories/project-repository.js";
import { SessionRepository } from "../persistence/repositories/session-repository.js";
import { TaskRepository } from "../persistence/repositories/task-repository.js";
import { JobRepository } from "../persistence/repositories/job-repository.js";
import { NodeRepository } from "../persistence/repositories/node-repository.js";
import { RemoteDispatchRepository } from "../persistence/repositories/remote-dispatch-repository.js";
import { ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import { LeaseRepository } from "../persistence/repositories/lease-repository.js";
import { CheckpointRepository } from "../persistence/repositories/checkpoint-repository.js";
import { EventRepository } from "../persistence/repositories/event-repository.js";
import { EventStore } from "../event-state/event-store.js";
import { TaskBoardProjection } from "../event-state/projections/task-board-projection.js";
import { SessionSummaryProjection } from "../event-state/projections/session-summary-projection.js";
import { TaskClaimManager } from "../tasks/task-claim-manager.js";
import { SessionResumeEngine } from "../resume/session-resume-engine.js";
import { CrashRecoveryEngine } from "../recovery/crash-recovery-engine.js";
import { PolicyEngine } from "../policy/policy-engine.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { SessionController } from "../cli/session-controller.js";
import { CommandRegistry } from "../cli/command-registry.js";
import { CommandParser } from "../cli/command-parser.js";
import { CliErrorHandler } from "../cli/error-handler.js";
import { SignalHandler } from "../cli/signal-handler.js";

import { TuiStateAdapter } from "./tui-state-adapter.js";
import { TuiRenderer } from "./tui-renderer.js";
import { TuiController } from "./tui-controller.js";
import { type TuiDimensions } from "../domain/tui.js";

export interface TuiApplicationOptions {
  dbPath?: string;
  initialProjectId?: string;
  initialSessionId?: string;
  dimensions?: TuiDimensions;
  coalesceIntervalMs?: number;
}

/**
 * Anantham V2 TUI Application Container.
 * PRD Part 2 Section 185–195.
 */
export class TuiApplication {
  public readonly engine: SqliteEngine;
  public readonly projectRepo: ProjectRepository;
  public readonly sessionRepo: SessionRepository;
  public readonly taskRepo: TaskRepository;
  public readonly jobRepo: JobRepository;
  public readonly nodeRepo: NodeRepository;
  public readonly dispatchRepo: RemoteDispatchRepository;
  public readonly artifactRepo: ArtifactRepository;
  public readonly leaseRepo: LeaseRepository;
  public readonly checkpointRepo: CheckpointRepository;
  public readonly eventRepo: EventRepository;
  public readonly eventStore: EventStore;

  public readonly taskBoardProjection: TaskBoardProjection;
  public readonly sessionSummaryProjection: SessionSummaryProjection;

  public readonly claimManager: TaskClaimManager;
  public readonly policyEngine: PolicyEngine;
  public readonly toolRegistry: ToolRegistry;
  public readonly resumeEngine: SessionResumeEngine;
  public readonly recoveryEngine: CrashRecoveryEngine;

  public readonly parser: CommandParser;
  public readonly errorHandler: CliErrorHandler;
  public readonly sessionController: SessionController;
  public readonly commandRegistry: CommandRegistry;
  public readonly signalHandler: SignalHandler;

  public readonly stateAdapter: TuiStateAdapter;
  public readonly renderer: TuiRenderer;
  public readonly controller: TuiController;

  private isInitialized = false;
  private escapeTimer?: NodeJS.Timeout;
  private activeStream?: Readable;
  private resizeListener?: () => void;

  constructor(options: TuiApplicationOptions = {}) {
    const dbPath = options.dbPath ?? ":memory:";
    this.engine = new SqliteEngine({ path: dbPath });

    this.projectRepo = new ProjectRepository(this.engine);
    this.sessionRepo = new SessionRepository(this.engine);
    this.taskRepo = new TaskRepository(this.engine);
    this.jobRepo = new JobRepository(this.engine);
    this.nodeRepo = new NodeRepository(this.engine);
    this.dispatchRepo = new RemoteDispatchRepository(this.engine);
    this.artifactRepo = new ArtifactRepository(this.engine);
    this.leaseRepo = new LeaseRepository(this.engine);
    this.checkpointRepo = new CheckpointRepository(this.engine);
    this.eventRepo = new EventRepository(this.engine);
    this.eventStore = new EventStore(this.engine);

    this.taskBoardProjection = new TaskBoardProjection();
    this.sessionSummaryProjection = new SessionSummaryProjection();

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
    this.errorHandler = new CliErrorHandler();

    this.sessionController = new SessionController({
      projectRepo: this.projectRepo,
      sessionRepo: this.sessionRepo,
      initialProjectId: options.initialProjectId,
      initialSessionId: options.initialSessionId,
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

    this.stateAdapter = new TuiStateAdapter({
      eventStore: this.eventStore,
      taskBoardProjection: this.taskBoardProjection,
      sessionSummaryProjection: this.sessionSummaryProjection,
      projectRepo: this.projectRepo,
      sessionRepo: this.sessionRepo,
      taskRepo: this.taskRepo,
      jobRepo: this.jobRepo,
      nodeRepo: this.nodeRepo,
      dispatchRepo: this.dispatchRepo,
      artifactRepo: this.artifactRepo,
      initialProjectId: options.initialProjectId,
      initialSessionId: options.initialSessionId,
    });

    this.renderer = new TuiRenderer({
      dimensions: options.dimensions ?? { width: 80, height: 24 },
      redactSecrets: true,
    });

    this.controller = new TuiController({
      stateAdapter: this.stateAdapter,
      renderer: this.renderer,
      commandRegistry: this.commandRegistry,
      commandParser: this.parser,
      errorHandler: this.errorHandler,
      coalesceIntervalMs: options.coalesceIntervalMs ?? 30,
    });
  }

  /**
   * Initialize runtime services and database.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.engine.open();
    const migrator = new MigrationEngine(this.engine);
    migrator.migrate();

    try {
      await this.recoveryEngine.executeRecovery();
      this.stateAdapter.setStatus("RECOVERED");
    } catch {
      this.stateAdapter.setStatus("NORMAL");
    }

    this.signalHandler.attach();
    this.isInitialized = true;
  }

  /**
   * Start TUI session loop over input and output streams.
   */
  public async start(input?: Readable, _output?: Writable): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.controller.start();

    const inStream = input ?? process.stdin;
    this.activeStream = inStream;

    if (inStream === process.stdin && process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }

    if (typeof process.stdout.on === "function") {
      this.resizeListener = () => {
        if (process.stdout.columns && process.stdout.rows) {
          this.controller.setDimensions({
            width: process.stdout.columns,
            height: process.stdout.rows,
          });
        }
      };
      process.stdout.on("resize", this.resizeListener);
    }

    let pendingBuffer = "";

    const flushBuffer = async (force: boolean): Promise<boolean> => {
      if (pendingBuffer.length === 0) return true;
      const { tokens, remainder } = TuiController.decodeInputTokens(pendingBuffer, force);
      pendingBuffer = remainder;

      for (const token of tokens) {
        const keepRunning = await this.controller.handleInput(token);
        if (!keepRunning || !this.controller.getIsRunning()) {
          return false;
        }
      }
      return true;
    };

    try {
      for await (const chunk of inStream) {
        if (this.escapeTimer) {
          clearTimeout(this.escapeTimer);
          this.escapeTimer = undefined;
        }

        pendingBuffer += chunk.toString();
        const keepRunning = await flushBuffer(false);
        if (!keepRunning || !this.controller.getIsRunning()) {
          return;
        }

        if (pendingBuffer.length > 0) {
          this.escapeTimer = setTimeout(async () => {
            this.escapeTimer = undefined;
            if (pendingBuffer.length > 0 && this.controller.getIsRunning()) {
              await flushBuffer(true);
            }
          }, 50);
          if (typeof this.escapeTimer.unref === "function") {
            this.escapeTimer.unref();
          }
        }
      }
    } catch (err: unknown) {
      const isPremature =
        err instanceof Error &&
        (err.message.includes("Premature close") ||
          (err as { code?: string }).code === "ERR_STREAM_PREMATURE_CLOSE");
      if (!this.controller.getIsRunning() && isPremature) {
        // Expected stream closure during shutdown
      } else {
        throw err;
      }
    } finally {
      if (this.escapeTimer) {
        clearTimeout(this.escapeTimer);
        this.escapeTimer = undefined;
      }
      if (this.resizeListener && typeof process.stdout.off === "function") {
        process.stdout.off("resize", this.resizeListener);
        this.resizeListener = undefined;
      }
      if (inStream === process.stdin && process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
        try {
          process.stdin.setRawMode(false);
          process.stdin.pause();
        } catch {
          // Suppress terminal restoration errors
        }
      }
    }

    // Flush any pending remainder when stream completes
    if (pendingBuffer.length > 0) {
      await flushBuffer(true);
    }
  }

  /**
   * Stop TUI application execution.
   */
  public stop(): void {
    this.shutdown();
  }

  /**
   * Shutdown TUI application gracefully.
   */
  public shutdown(): void {
    if (this.escapeTimer) {
      clearTimeout(this.escapeTimer);
      this.escapeTimer = undefined;
    }

    if (this.resizeListener && typeof process.stdout.off === "function") {
      process.stdout.off("resize", this.resizeListener);
      this.resizeListener = undefined;
    }

    if (this.activeStream && this.activeStream !== process.stdin && typeof this.activeStream.destroy === "function") {
      this.activeStream.destroy();
      this.activeStream = undefined;
    }

    if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
      try {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      } catch {
        // Suppress terminal raw mode teardown errors
      }
    }

    this.controller.stop();
    this.stateAdapter.destroy();
    this.signalHandler.detach();
    if (this.engine.isOpen()) {
      this.engine.close();
    }
  }
}
