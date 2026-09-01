import {
  type CreateProjectRequest,
  type CreateSessionRequest,
  type CreateTaskRequest,
  type ClaimTaskRequest,
  type CreateBackgroundJobRequest,
  type QueryEventsRequest,
} from "../domain/api.js";
import { type Project } from "../domain/project.js";
import { type Session } from "../domain/session.js";
import { type Task } from "../domain/task.js";
import { type TaskLease } from "../domain/lease.js";
import { type BackgroundJob } from "../domain/job.js";
import { type NodeIdentity } from "../domain/node.js";
import { type Artifact } from "../domain/artifact.js";
import { type HarnessEvent } from "../domain/event.js";
import { AnanthamApiError } from "./sdk-errors.js";

export interface AnanthamClientOptions {
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  timeoutMs?: number;
}

/**
 * Typed Programmatic TypeScript Client SDK for Anantham V2.
 * PRD Part 2 Section 215.
 */
export class AnanthamClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly bearerToken?: string;
  private readonly timeoutMs: number;

  constructor(options: AnanthamClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.bearerToken = options.bearerToken ?? (options.apiKey ? undefined : "anantham-dev-key");
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    if (this.bearerToken) {
      reqHeaders["Authorization"] = `Bearer ${this.bearerToken}`;
    } else if (this.apiKey) {
      reqHeaders["X-API-Key"] = this.apiKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: reqHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const json = (await response.json()) as any;

      if (!response.ok || json.success === false) {
        throw new AnanthamApiError({
          message: json.error?.message ?? `API Error (HTTP ${response.status})`,
          statusCode: response.status,
          classification: json.error?.classification,
          code: json.error?.code,
          details: json.error?.details,
        });
      }

      return json.data as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --- Health & Diagnostics ---

  public async health(): Promise<{ status: string; timestamp: string }> {
    const res = await this.request<{ status: string; timestamp: string }>("GET", "/v1/health");
    return res;
  }

  public async doctor(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", "/v1/doctor");
  }

  // --- Projects Resource ---

  public readonly projects = {
    list: async (): Promise<Project[]> => {
      return this.request<Project[]>("GET", "/v1/projects");
    },
    create: async (params: CreateProjectRequest, idempotencyKey?: string): Promise<Project> => {
      const headers = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined;
      return this.request<Project>("POST", "/v1/projects", params, headers);
    },
  };

  // --- Sessions Resource ---

  public readonly sessions = {
    list: async (projectId: string): Promise<Session[]> => {
      return this.request<Session[]>("GET", `/v1/sessions?projectId=${encodeURIComponent(projectId)}`);
    },
    create: async (params: CreateSessionRequest, idempotencyKey?: string): Promise<Session> => {
      const headers = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined;
      return this.request<Session>("POST", "/v1/sessions", params, headers);
    },
  };

  // --- Tasks Resource ---

  public readonly tasks = {
    list: async (sessionId: string): Promise<Task[]> => {
      return this.request<Task[]>("GET", `/v1/tasks?sessionId=${encodeURIComponent(sessionId)}`);
    },
    create: async (params: CreateTaskRequest, idempotencyKey?: string): Promise<Task> => {
      const headers = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined;
      return this.request<Task>("POST", "/v1/tasks", params, headers);
    },
    claim: async (taskId: string, params: ClaimTaskRequest, idempotencyKey?: string): Promise<TaskLease> => {
      const headers = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined;
      return this.request<TaskLease>("POST", `/v1/tasks/${encodeURIComponent(taskId)}/claim`, params, headers);
    },
  };

  // --- Background Jobs Resource ---

  public readonly jobs = {
    list: async (projectId: string): Promise<BackgroundJob[]> => {
      return this.request<BackgroundJob[]>("GET", `/v1/jobs?projectId=${encodeURIComponent(projectId)}`);
    },
    create: async (params: CreateBackgroundJobRequest, idempotencyKey?: string): Promise<BackgroundJob> => {
      const headers = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined;
      return this.request<BackgroundJob>("POST", "/v1/jobs", params, headers);
    },
  };

  // --- Remote Nodes Resource ---

  public readonly nodes = {
    list: async (): Promise<NodeIdentity[]> => {
      return this.request<NodeIdentity[]>("GET", "/v1/nodes");
    },
  };

  // --- Artifacts Resource ---

  public readonly artifacts = {
    list: async (sessionId: string): Promise<Artifact[]> => {
      return this.request<Artifact[]>("GET", `/v1/artifacts?sessionId=${encodeURIComponent(sessionId)}`);
    },
  };

  // --- Events Resource ---

  public readonly events = {
    list: async (query: Partial<QueryEventsRequest> = {}): Promise<HarnessEvent[]> => {
      const q = new URLSearchParams();
      if (query.sessionId) q.set("sessionId", query.sessionId);
      if (query.projectId) q.set("projectId", query.projectId);
      if (query.type) q.set("type", query.type);
      if (query.limit) q.set("limit", String(query.limit));
      if (query.offset) q.set("offset", String(query.offset));

      return this.request<HarnessEvent[]>("GET", `/v1/events?${q.toString()}`);
    },
  };
}
