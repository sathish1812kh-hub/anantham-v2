import { randomUUID } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";

import {
  CreateProjectRequestSchema,
  CreateSessionRequestSchema,
  CreateTaskRequestSchema,
  ClaimTaskRequestSchema,
  CreateBackgroundJobRequestSchema,
  QueryEventsRequestSchema,
} from "../domain/api.js";

import { type SqliteEngine } from "../persistence/sqlite-engine.js";
import { type ProjectRepository } from "../persistence/repositories/project-repository.js";
import { type SessionRepository } from "../persistence/repositories/session-repository.js";
import { type TaskRepository } from "../persistence/repositories/task-repository.js";
import { type JobRepository } from "../persistence/repositories/job-repository.js";
import { type NodeRepository } from "../persistence/repositories/node-repository.js";
import { type ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import { type EventStore } from "../event-state/event-store.js";
import { type TaskClaimManager } from "../tasks/task-claim-manager.js";
import { type CrashRecoveryEngine } from "../recovery/crash-recovery-engine.js";

import { ApiAuthenticator } from "./api-authenticator.js";
import { ApiAuthorizer } from "./api-authorizer.js";
import { ApiErrorMapper } from "./api-error-mapper.js";
import { ApiIdempotencyManager } from "./api-idempotency-manager.js";
import { OpenApiGenerator } from "./openapi-generator.js";

export interface ApiRouterOptions {
  engine: SqliteEngine;
  projectRepo: ProjectRepository;
  sessionRepo: SessionRepository;
  taskRepo: TaskRepository;
  jobRepo: JobRepository;
  nodeRepo: NodeRepository;
  artifactRepo: ArtifactRepository;
  eventStore: EventStore;
  claimManager?: TaskClaimManager;
  recoveryEngine?: CrashRecoveryEngine;
  authenticator?: ApiAuthenticator;
  idempotencyManager?: ApiIdempotencyManager;
}

/**
 * REST API Router & Request Dispatcher.
 * PRD Part 2 Section 200–215.
 */
export class ApiRouter {
  public readonly engine: SqliteEngine;
  public readonly projectRepo: ProjectRepository;
  public readonly sessionRepo: SessionRepository;
  public readonly taskRepo: TaskRepository;
  public readonly jobRepo: JobRepository;
  public readonly nodeRepo: NodeRepository;
  public readonly artifactRepo: ArtifactRepository;
  public readonly eventStore: EventStore;
  public readonly claimManager?: TaskClaimManager;
  public readonly recoveryEngine?: CrashRecoveryEngine;

  public readonly authenticator: ApiAuthenticator;
  public readonly idempotencyManager: ApiIdempotencyManager;

  constructor(options: ApiRouterOptions) {
    this.engine = options.engine;
    this.projectRepo = options.projectRepo;
    this.sessionRepo = options.sessionRepo;
    this.taskRepo = options.taskRepo;
    this.jobRepo = options.jobRepo;
    this.nodeRepo = options.nodeRepo;
    this.artifactRepo = options.artifactRepo;
    this.eventStore = options.eventStore;
    this.claimManager = options.claimManager;
    this.recoveryEngine = options.recoveryEngine;

    this.authenticator = options.authenticator ?? new ApiAuthenticator();
    this.idempotencyManager = options.idempotencyManager ?? new ApiIdempotencyManager();
  }

  /**
   * Handle incoming HTTP request and route to appropriate controller.
   */
  public async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() ?? "GET";

    // 1. CORS Preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, Idempotency-Key",
      });
      res.end();
      return;
    }

    // 2. OpenAPI Spec (Public)
    if (pathname === "/openapi.json" || pathname === "/v1/openapi.json") {
      const spec = OpenApiGenerator.generateSpec();
      this.sendJson(res, 200, spec);
      return;
    }

    // 3. Health & Doctor (Public / Basic Auth)
    if (pathname === "/v1/health" || pathname === "/health") {
      this.sendJson(res, 200, {
        success: true,
        data: { status: "healthy", timestamp: new Date().toISOString() },
      });
      return;
    }

    if (pathname === "/v1/doctor" || pathname === "/doctor") {
      const diagnostics = {
        timestamp: new Date().toISOString(),
        sqliteWal: this.engine.isOpen() ? "HEALTHY" : "CLOSED",
        eventStore: "OPERATIONAL",
        nodeVersion: process.version,
      };
      this.sendJson(res, 200, { success: true, data: diagnostics });
      return;
    }

    // 4. Authenticate Request
    const auth = this.authenticator.authenticate(req);
    if (!auth.authenticated) {
      this.sendError(res, 401, new Error("Unauthorized: Missing or invalid authentication credentials."));
      return;
    }

    // 5. Idempotency Check for Mutating Requests
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
    if (idempotencyKey && (method === "POST" || method === "PUT" || method === "DELETE")) {
      const cached = this.idempotencyManager.get(idempotencyKey);
      if (cached) {
        this.sendJson(res, cached.statusCode, cached.responseBody);
        return;
      }
    }

    // 6. Route Dispatch
    try {
      const body = await this.readRequestBody(req);

      // --- Projects ---
      if (pathname === "/v1/projects" && method === "GET") {
        const projects = this.projectRepo.list();
        const filtered = projects.filter((p) => ApiAuthorizer.authorizeProject(auth, p.id));
        this.sendJson(res, 200, { success: true, data: filtered });
        return;
      }

      if (pathname === "/v1/projects" && method === "POST") {
        const parsed = CreateProjectRequestSchema.parse(body);
        const projectId = `proj_${randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();

        const project = {
          id: projectId,
          name: parsed.name,
          rootPath: parsed.rootPath ?? process.cwd(),
          status: "active" as const,
          tags: parsed.tags ?? [],
          modelProfile: parsed.modelProfile ?? "default",
          memoryNamespace: "default",
          orchestrationProfile: "default",
          trustProfile: parsed.trustProfile ?? "safe",
          createdAt: now,
          lastOpenedAt: now,
          lastActivityAt: now,
          metadata: {},
        };

        this.projectRepo.save(project);
        const responseData = { success: true, data: project };

        if (idempotencyKey) {
          this.idempotencyManager.set(idempotencyKey, 201, responseData);
        }

        this.sendJson(res, 201, responseData);
        return;
      }

      // --- Sessions ---
      if (pathname === "/v1/sessions" && method === "GET") {
        const projectId = url.searchParams.get("projectId") ?? undefined;
        if (!projectId) {
          throw new Error("Validation Error: Missing required 'projectId' query parameter.");
        }
        if (!ApiAuthorizer.authorizeProject(auth, projectId)) {
          throw new Error(`Forbidden: Access to project '${projectId}' denied by policy.`);
        }

        const sessions = this.sessionRepo.listByProject(projectId);
        this.sendJson(res, 200, { success: true, data: sessions });
        return;
      }

      if (pathname === "/v1/sessions" && method === "POST") {
        const parsed = CreateSessionRequestSchema.parse(body);
        if (!ApiAuthorizer.authorizeProject(auth, parsed.projectId)) {
          throw new Error(`Forbidden: Access to project '${parsed.projectId}' denied by policy.`);
        }

        const now = new Date().toISOString();
        const session = {
          id: `sess_${randomUUID().slice(0, 8)}`,
          projectId: parsed.projectId,
          name: parsed.name,
          branch: parsed.branch ?? "main",
          status: "active" as const,
          modelProfile: parsed.modelProfile ?? "default",
          keyPoolProfile: "default",
          mode: "interactive" as const,
          permissions: {},
          createdAt: now,
          updatedAt: now,
          metadata: {},
        };

        this.sessionRepo.save(session);
        const responseData = { success: true, data: session };

        if (idempotencyKey) {
          this.idempotencyManager.set(idempotencyKey, 201, responseData);
        }

        this.sendJson(res, 201, responseData);
        return;
      }

      // --- Tasks ---
      if (pathname === "/v1/tasks" && method === "GET") {
        const sessionId = url.searchParams.get("sessionId") ?? undefined;
        if (!sessionId) {
          throw new Error("Validation Error: Missing required 'sessionId' query parameter.");
        }

        const tasks = this.taskRepo.listBySession(sessionId);
        this.sendJson(res, 200, { success: true, data: tasks });
        return;
      }

      if (pathname === "/v1/tasks" && method === "POST") {
        const parsed = CreateTaskRequestSchema.parse(body);
        if (!ApiAuthorizer.authorizeProject(auth, parsed.projectId)) {
          throw new Error(`Forbidden: Access to project '${parsed.projectId}' denied by policy.`);
        }

        const now = new Date().toISOString();
        const task = {
          id: `task_${randomUUID().slice(0, 8)}`,
          projectId: parsed.projectId,
          sessionId: parsed.sessionId,
          objective: parsed.objective,
          status: "available" as const,
          priority: parsed.priority ?? "normal",
          dependencies: parsed.dependencies ?? [],
          inputArtifacts: [],
          outputArtifacts: [],
          createdAt: now,
          updatedAt: now,
          metadata: {},
        };

        this.taskRepo.save(task);
        const responseData = { success: true, data: task };

        if (idempotencyKey) {
          this.idempotencyManager.set(idempotencyKey, 201, responseData);
        }

        this.sendJson(res, 201, responseData);
        return;
      }

      // --- Task Claim ---
      const claimMatch = pathname.match(/^\/v1\/tasks\/([^/]+)\/claim$/);
      if (claimMatch && method === "POST") {
        const taskId = claimMatch[1]!;
        const task = this.taskRepo.findById(taskId);
        if (!task) {
          throw new Error(`Task '${taskId}' not found.`);
        }
        if (!ApiAuthorizer.authorizeProject(auth, task.projectId)) {
          throw new Error(`Forbidden: Access to project '${task.projectId}' denied.`);
        }

        const parsed = ClaimTaskRequestSchema.parse(body);
        if (!this.claimManager) {
          throw new Error("TaskClaimManager unavailable.");
        }

        const claimRes = this.claimManager.claimTask({
          taskId,
          agentId: parsed.agentId,
          instanceId: parsed.instanceId,
          projectId: task.projectId,
          sessionId: task.sessionId,
          ttlMs: parsed.leaseTtlMs,
        });

        if (!claimRes.success) {
          throw new Error(`Failed to claim task: ${claimRes.errorMessage}`);
        }

        const responseData = { success: true, data: claimRes.lease };
        if (idempotencyKey) {
          this.idempotencyManager.set(idempotencyKey, 200, responseData);
        }

        this.sendJson(res, 200, responseData);
        return;
      }

      // --- Background Jobs ---
      if (pathname === "/v1/jobs" && method === "GET") {
        const projectId = url.searchParams.get("projectId") ?? undefined;
        if (!projectId) {
          throw new Error("Validation Error: Missing required 'projectId' query parameter.");
        }
        if (!ApiAuthorizer.authorizeProject(auth, projectId)) {
          throw new Error(`Forbidden: Access to project '${projectId}' denied.`);
        }

        const jobs = this.jobRepo.listJobsByProject(projectId);
        this.sendJson(res, 200, { success: true, data: jobs });
        return;
      }

      if (pathname === "/v1/jobs" && method === "POST") {
        const parsed = CreateBackgroundJobRequestSchema.parse(body);
        if (!ApiAuthorizer.authorizeProject(auth, parsed.projectId)) {
          throw new Error(`Forbidden: Access to project '${parsed.projectId}' denied.`);
        }

        const now = new Date().toISOString();
        const job = {
          id: `job_${randomUUID().slice(0, 8)}`,
          projectId: parsed.projectId,
          sessionId: parsed.sessionId,
          taskId: parsed.taskId,
          agentId: parsed.agentId,
          instanceId: `inst_${randomUUID().slice(0, 6)}`,
          status: "QUEUED" as const,
          createdAt: now,
          attempt: 0,
          maxAttempts: 3,
          generation: 1,
          leaseId: `lease_${randomUUID().slice(0, 8)}`,
          consumption: {
            tokens: 0,
            costUsd: 0,
            durationMs: 0,
            toolCalls: 0,
          },
          resultArtifacts: [],
          metadata: parsed.payload ?? {},
        };

        this.jobRepo.saveJob(job);
        const responseData = { success: true, data: job };

        if (idempotencyKey) {
          this.idempotencyManager.set(idempotencyKey, 201, responseData);
        }

        this.sendJson(res, 201, responseData);
        return;
      }

      // --- Remote Nodes ---
      if (pathname === "/v1/nodes" && method === "GET") {
        const nodes = this.nodeRepo.listAllNodes();
        this.sendJson(res, 200, { success: true, data: nodes });
        return;
      }

      // --- Artifacts ---
      if (pathname === "/v1/artifacts" && method === "GET") {
        const sessionId = url.searchParams.get("sessionId") ?? undefined;
        if (!sessionId) {
          throw new Error("Validation Error: Missing required 'sessionId' query parameter.");
        }

        const artifacts = this.artifactRepo.listBySession(sessionId);
        this.sendJson(res, 200, { success: true, data: artifacts });
        return;
      }

      // --- Events ---
      if (pathname === "/v1/events" && method === "GET") {
        const queryObj = Object.fromEntries(url.searchParams.entries());
        const parsed = QueryEventsRequestSchema.parse(queryObj);

        let events: unknown[] = [];
        if (parsed.sessionId) {
          events = this.eventStore.getEventsBySession(parsed.sessionId, {
            type: parsed.type,
            limit: parsed.limit,
            offset: parsed.offset,
          });
        } else if (parsed.projectId) {
          events = this.eventStore.getEventsByProject(parsed.projectId, {
            type: parsed.type,
            limit: parsed.limit,
            offset: parsed.offset,
          });
        }

        this.sendJson(res, 200, {
          success: true,
          data: events,
          pagination: {
            total: events.length,
            limit: parsed.limit,
            offset: parsed.offset,
            hasMore: events.length === parsed.limit,
          },
        });
        return;
      }

      // --- Inbound Webhook Ingestion ---
      const inboundWebhookMatch = pathname.match(/^\/v1\/webhooks\/inbound\/([^/]+)$/);
      if (inboundWebhookMatch && method === "POST") {
        const integrationId = inboundWebhookMatch[1]!;
        const { WebhookIngestionEngine } = await import("../integrations/webhook-ingestion-engine.js");
        const { IntegrationRepository } = await import("../persistence/repositories/integration-repository.js");
        const integrationRepo = new IntegrationRepository(this.engine);
        const ingestionEngine = new WebhookIngestionEngine({
          eventStore: this.eventStore,
          integrationRepo,
        });

        const rawBodyStr = JSON.stringify(body);
        const ingestRes = ingestionEngine.ingest(integrationId, rawBodyStr, req.headers);
        if (!ingestRes.accepted) {
          throw new Error(`Bad Request: ${ingestRes.errorMessage}`);
        }

        this.sendJson(res, 200, { success: true, data: ingestRes });
        return;
      }

      // --- Observability & Audit Trails ---
      if (pathname === "/v1/observability/audit" && method === "GET") {
        const projectId = url.searchParams.get("projectId") ?? undefined;
        if (projectId && !ApiAuthorizer.authorizeProject(auth, projectId)) {
          throw new Error(`Forbidden: Access to project '${projectId}' audit records denied.`);
        }

        const { AuditLogger } = await import("../observability/audit-logger.js");
        const auditLogger = new AuditLogger();
        const records = auditLogger.query({ projectId });
        this.sendJson(res, 200, { success: true, data: records });
        return;
      }

      if (pathname === "/v1/observability/metrics" && method === "GET") {
        const projectId = url.searchParams.get("projectId") ?? undefined;
        if (projectId && !ApiAuthorizer.authorizeProject(auth, projectId)) {
          throw new Error(`Forbidden: Access to project '${projectId}' metrics denied.`);
        }

        const { TelemetryEngine } = await import("../observability/telemetry-engine.js");
        const telemetry = new TelemetryEngine();
        const summaries = telemetry.getMetricSummaries(projectId);
        this.sendJson(res, 200, { success: true, data: summaries });
        return;
      }

      if (pathname === "/v1/observability/compliance" && method === "GET") {
        const projectId = url.searchParams.get("projectId") ?? undefined;
        if (!projectId) {
          throw new Error("Validation Error: Missing required 'projectId' query parameter.");
        }
        if (!ApiAuthorizer.authorizeProject(auth, projectId)) {
          throw new Error(`Forbidden: Access to project '${projectId}' compliance report denied.`);
        }

        const { AuditLogger } = await import("../observability/audit-logger.js");
        const { ComplianceExporter } = await import("../observability/compliance-exporter.js");
        const auditLogger = new AuditLogger();
        const exporter = new ComplianceExporter(auditLogger);
        const report = exporter.exportReport(projectId);
        this.sendJson(res, 200, { success: true, data: report });
        return;
      }

      // 404 Route Not Found
      throw new Error(`Not Found: Endpoint '${method} ${pathname}' does not exist.`);
    } catch (err) {
      const { statusCode, response } = ApiErrorMapper.mapError(err);
      this.sendJson(res, statusCode, response);
    }
  }

  private sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(data, null, 2));
  }

  private sendError(res: ServerResponse, statusCode: number, error: unknown): void {
    const mapped = ApiErrorMapper.mapError(error);
    this.sendJson(res, statusCode, mapped.response);
  }

  private async readRequestBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) {
          // 5MB limit
          reject(new Error("Validation Error: Request payload exceeds maximum size limit."));
        }
      });
      req.on("end", () => {
        if (!body.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Validation Error: Malformed JSON payload."));
        }
      });
      req.on("error", reject);
    });
  }
}
