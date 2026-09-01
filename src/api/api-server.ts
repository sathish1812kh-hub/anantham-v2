import http from "node:http";
import { type AddressInfo } from "node:net";

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
import { TaskClaimManager } from "../tasks/task-claim-manager.js";
import { CrashRecoveryEngine } from "../recovery/crash-recovery-engine.js";

import { ApiRouter } from "./api-router.js";
import { ApiAuthenticator } from "./api-authenticator.js";
import { ApiIdempotencyManager } from "./api-idempotency-manager.js";

export interface ApiServerOptions {
  dbPath?: string;
  port?: number;
  host?: string;
  authenticator?: ApiAuthenticator;
  idempotencyManager?: ApiIdempotencyManager;
}

/**
 * Native Node.js HTTP Server Container for Anantham V2 REST API.
 * PRD Part 2 Section 200–215.
 */
export class ApiServer {
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
  public readonly claimManager: TaskClaimManager;
  public readonly recoveryEngine: CrashRecoveryEngine;

  public readonly router: ApiRouter;
  public readonly server: http.Server;
  private isInitialized = false;

  constructor(options: ApiServerOptions = {}) {
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

    this.claimManager = new TaskClaimManager({
      engine: this.engine,
      taskRepo: this.taskRepo,
      leaseRepo: this.leaseRepo,
      eventStore: this.eventStore,
    });

    this.recoveryEngine = new CrashRecoveryEngine({
      engine: this.engine,
      eventStore: this.eventStore,
      checkpointRepo: this.checkpointRepo,
      artifactRepo: this.artifactRepo,
    });

    this.router = new ApiRouter({
      engine: this.engine,
      projectRepo: this.projectRepo,
      sessionRepo: this.sessionRepo,
      taskRepo: this.taskRepo,
      jobRepo: this.jobRepo,
      nodeRepo: this.nodeRepo,
      artifactRepo: this.artifactRepo,
      eventStore: this.eventStore,
      claimManager: this.claimManager,
      recoveryEngine: this.recoveryEngine,
      authenticator: options.authenticator,
      idempotencyManager: options.idempotencyManager,
    });

    this.server = http.createServer((req, res) => {
      this.router.handleRequest(req, res).catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: { message: err.message, code: "server_error" } }));
        }
      });
    });
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.engine.open();
    const migrator = new MigrationEngine(this.engine);
    migrator.migrate();

    try {
      await this.recoveryEngine.executeRecovery();
    } catch {
      // Non-blocking on clean setup
    }

    this.isInitialized = true;
  }

  public async listen(port = 0, host = "127.0.0.1"): Promise<{ port: number; host: string; url: string }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve) => {
      this.server.listen(port, host, () => {
        const addr = this.server.address() as AddressInfo;
        const actualPort = addr.port;
        const actualHost = addr.address;
        resolve({
          port: actualPort,
          host: actualHost,
          url: `http://${actualHost}:${actualPort}`,
        });
      });
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        if (this.engine.isOpen()) {
          this.engine.close();
        }
        resolve();
      });
    });
  }
}
