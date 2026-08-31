/**
 * Anantham V2 — Model Context Protocol (MCP) Domain Contracts
 *
 * Defines authoritative domain models, types, and runtime Zod schemas for
 * MCP servers, transports, tools, resources, prompts, health states, and discovery results.
 */

import { z } from "zod";
import { RiskLevelSchema } from "./policy.js";
import { SensitivityLevelSchema } from "./security.js";
import { SideEffectCategorySchema } from "./side-effect.js";

export const MCPTransportTypeSchema = z.enum(["stdio", "http", "sse", "websocket"]);
export type MCPTransportType = z.infer<typeof MCPTransportTypeSchema>;

export const MCPTrustStateSchema = z.enum(["untrusted", "user_approved", "verified"]);
export type MCPTrustState = z.infer<typeof MCPTrustStateSchema>;

export const MCPConnectionStateSchema = z.enum([
  "disabled",
  "starting",
  "connecting",
  "initializing",
  "connected",
  "disconnecting",
  "disconnected",
  "failed",
]);
export type MCPConnectionState = z.infer<typeof MCPConnectionStateSchema>;

export const MCPHealthStatusSchema = z.enum([
  "healthy",
  "degraded",
  "unhealthy",
  "unavailable",
  "disabled",
]);
export type MCPHealthStatus = z.infer<typeof MCPHealthStatusSchema>;

export const MCPServerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  transport: MCPTransportTypeSchema,
  endpoint: z.string().url().optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string(), z.string()).optional().default({}),
  cwd: z.string().optional(),
  projectId: z.string().optional(),
  enabled: z.boolean().default(true),
  trustState: MCPTrustStateSchema.default("user_approved"),
  authProfile: z.string().optional(),
  timeoutMs: z.number().int().positive().optional().default(30000),
  capabilities: z.array(z.string()).optional().default(["tools", "resources", "prompts"]),
  rateLimit: z
    .object({
      maxCallsPerMinute: z.number().int().positive().optional(),
      maxConcurrentCalls: z.number().int().positive().optional(),
    })
    .optional(),
});
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export const MCPToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  serverId: z.string().min(1),
  category: SideEffectCategorySchema.optional().default("unknown"),
  isIdempotent: z.boolean().optional().default(false),
  riskLevel: RiskLevelSchema.optional().default("medium"),
  sensitivity: SensitivityLevelSchema.optional().default("normal"),
  timeoutMs: z.number().int().positive().optional(),
});
export type MCPTool = z.infer<typeof MCPToolSchema>;

export const MCPResourceSchema = z.object({
  uri: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  mimeType: z.string().optional().default("text/plain"),
  serverId: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
});
export type MCPResource = z.infer<typeof MCPResourceSchema>;

export const MCPResourceTemplateSchema = z.object({
  uriTemplate: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  serverId: z.string().min(1),
});
export type MCPResourceTemplate = z.infer<typeof MCPResourceTemplateSchema>;

export const MCPPromptArgumentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional().default(false),
});
export type MCPPromptArgument = z.infer<typeof MCPPromptArgumentSchema>;

export const MCPPromptSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  arguments: z.array(MCPPromptArgumentSchema).optional().default([]),
  serverId: z.string().min(1),
});
export type MCPPrompt = z.infer<typeof MCPPromptSchema>;

export const MCPDiscoveryResultSchema = z.object({
  serverId: z.string().min(1),
  tools: z.array(MCPToolSchema).default([]),
  resources: z.array(MCPResourceSchema).default([]),
  resourceTemplates: z.array(MCPResourceTemplateSchema).default([]),
  prompts: z.array(MCPPromptSchema).default([]),
  capabilities: z.record(z.string(), z.unknown()).default({}),
  discoveredAt: z.string().datetime(),
  fingerprint: z.string().min(1),
});
export type MCPDiscoveryResult = z.infer<typeof MCPDiscoveryResultSchema>;

export const MCPServerRecordSchema = z.object({
  config: MCPServerConfigSchema,
  discovery: MCPDiscoveryResultSchema.optional(),
  connectionState: MCPConnectionStateSchema.default("disconnected"),
  healthStatus: MCPHealthStatusSchema.default("healthy"),
  lastConnectedAt: z.string().datetime().optional(),
  lastHealthCheckAt: z.string().datetime().optional(),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  circuitBroken: z.boolean().default(false),
  circuitBrokenUntil: z.string().datetime().optional(),
});
export type MCPServerRecord = z.infer<typeof MCPServerRecordSchema>;
