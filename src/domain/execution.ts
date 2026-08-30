import { z } from "zod";

/**
 * Anantham V2 — Execution Plane Contracts & Types
 * PRD Part 1 Section 83-90 & PRD Part 2 Section 41-48 / P4.4
 */

export const ExecutorTypeSchema = z.enum(["local", "docker", "remote"]);
export type ExecutorType = z.infer<typeof ExecutorTypeSchema>;

export const ExecutionStatusSchema = z.enum([
  "completed",
  "failed",
  "timed_out",
  "cancelled",
  "killed",
  "lost",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ProcessLifecycleStateSchema = z.enum([
  "created",
  "starting",
  "running",
  "completing",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
  "killed",
  "lost",
]);
export type ProcessLifecycleState = z.infer<typeof ProcessLifecycleStateSchema>;

export const NetworkPolicySchema = z.enum(["disabled", "restricted", "allowed"]);
export type NetworkPolicy = z.infer<typeof NetworkPolicySchema>;

export const ResourceLimitsSchema = z.object({
  maxMemoryMb: z.number().positive().optional(),
  maxCpuPercent: z.number().min(0).max(100).optional(),
  timeoutMs: z.number().positive().optional(),
  maxOutputBytes: z.number().positive().optional(),
});
export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>;

export const ResourceUsageSchema = z.object({
  wallTimeMs: z.number().nonnegative(),
  memoryBytes: z.number().nonnegative().optional(),
  cpuPercent: z.number().min(0).max(100).optional(),
});
export type ResourceUsage = z.infer<typeof ResourceUsageSchema>;

export const SandboxMountSchema = z.object({
  hostPath: z.string().min(1),
  containerPath: z.string().min(1),
  readOnly: z.boolean().optional().default(false),
});
export type SandboxMount = z.infer<typeof SandboxMountSchema>;

export const SandboxConfigSchema = z.object({
  image: z.string().min(1).optional().default("alpine:latest"),
  mounts: z.array(SandboxMountSchema).optional().default([]),
  network: NetworkPolicySchema.optional().default("disabled"),
  privileged: z.boolean().optional().default(false),
  env: z.record(z.string()).optional(),
});
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

export const ExecutionRequestSchema = z.object({
  executionId: z.string().min(1),
  executorType: ExecutorTypeSchema.optional().default("local"),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  projectRoot: z.string().optional(),
  timeoutMs: z.number().positive().optional(),
  maxOutputBytes: z.number().positive().optional(),
  limits: ResourceLimitsSchema.optional(),
  sandbox: SandboxConfigSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

export const ExecutionResultSchema = z.object({
  executionId: z.string().min(1),
  executorType: ExecutorTypeSchema,
  status: ExecutionStatusSchema,
  exitCode: z.number().nullable().optional(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean().optional(),
  durationMs: z.number().nonnegative(),
  usage: ResourceUsageSchema.optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
