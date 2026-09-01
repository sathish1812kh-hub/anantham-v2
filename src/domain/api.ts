import { z } from "zod";
import { TrustProfileSchema } from "./project.js";
import { TaskPrioritySchema } from "./task.js";

/**
 * Standard API Pagination Meta.
 */
export const ApiPaginationMetaSchema = z.object({
  total: z.number().int().min(0),
  limit: z.number().int().min(1).default(50),
  offset: z.number().int().min(0).default(0),
  hasMore: z.boolean(),
});
export type ApiPaginationMeta = z.infer<typeof ApiPaginationMetaSchema>;

/**
 * Standard API Response Envelope.
 */
export const ApiResponseEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    pagination: ApiPaginationMetaSchema.optional(),
    meta: z.record(z.unknown()).optional(),
  });

/**
 * Standard API Error Response Envelope.
 */
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    classification: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Authenticated API Context.
 */
export const ApiAuthContextSchema = z.object({
  authenticated: z.boolean(),
  actorId: z.string(),
  role: z.string().default("operator"),
  allowedProjects: z.array(z.string()).default(["*"]), // Wildcard or specific project IDs
});
export type ApiAuthContext = z.infer<typeof ApiAuthContextSchema>;

// --- Request / Response Models ---

export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1).max(100),
  rootPath: z.string().optional(),
  tags: z.array(z.string()).optional(),
  modelProfile: z.string().optional(),
  trustProfile: TrustProfileSchema.optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const CreateSessionRequestSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(100),
  branch: z.string().optional(),
  modelProfile: z.string().optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const CreateTaskRequestSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  objective: z.string().min(1),
  priority: TaskPrioritySchema.optional(),
  dependencies: z.array(z.string()).optional(),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

export const ClaimTaskRequestSchema = z.object({
  agentId: z.string().min(1),
  instanceId: z.string().min(1),
  leaseTtlMs: z.number().int().positive().optional(),
});
export type ClaimTaskRequest = z.infer<typeof ClaimTaskRequestSchema>;

export const CreateWorkflowRunRequestSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  inputs: z.record(z.unknown()).optional(),
});
export type CreateWorkflowRunRequest = z.infer<typeof CreateWorkflowRunRequestSchema>;

export const CreateBackgroundJobRequestSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().min(1),
  agentId: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});
export type CreateBackgroundJobRequest = z.infer<typeof CreateBackgroundJobRequestSchema>;

export const QueryEventsRequestSchema = z.object({
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type QueryEventsRequest = z.infer<typeof QueryEventsRequestSchema>;
