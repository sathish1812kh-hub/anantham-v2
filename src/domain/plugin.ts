/**
 * Anantham V2 — Plugin Domain Contracts
 *
 * Defines authoritative domain models, types, and runtime Zod schemas for
 * Plugin manifests, lifecycle state machines, trust models, permissions,
 * compatibility constraints, and registry records.
 */

import { z } from "zod";

export const PluginClassSchema = z.enum([
  "model-provider",
  "tool",
  "skill",
  "agent",
  "executor",
  "verifier",
  "memory-provider",
  "mcp-adapter",
  "command",
  "hook",
  "ui",
  "scheduler",
  "connector",
]);
export type PluginClass = z.infer<typeof PluginClassSchema>;

export const PluginTrustStateSchema = z.enum([
  "unknown",
  "reviewed",
  "trusted",
  "restricted",
  "blocked",
]);
export type PluginTrustState = z.infer<typeof PluginTrustStateSchema>;

export const PluginLifecycleStateSchema = z.enum([
  "discovered",
  "inspected",
  "validated",
  "resolved",
  "reviewed",
  "installing",
  "installed",
  "verifying",
  "active",
  "disabled",
  "unloaded",
  "failed",
]);
export type PluginLifecycleState = z.infer<typeof PluginLifecycleStateSchema>;

export const PluginHealthStateSchema = z.enum([
  "healthy",
  "degraded",
  "unhealthy",
  "failed",
]);
export type PluginHealthState = z.infer<typeof PluginHealthStateSchema>;

export const PluginPermissionsSchema = z.object({
  network: z.array(z.string()).optional().default([]),
  filesystem: z
    .object({
      read: z.array(z.string()).optional().default([]),
      write: z.array(z.string()).optional().default([]),
    })
    .optional()
    .default({ read: [], write: [] }),
  credentials: z.array(z.string()).optional().default([]),
  tools: z.array(z.string()).optional().default([]),
  subprocess: z.boolean().optional().default(false),
});
export type PluginPermissions = z.infer<typeof PluginPermissionsSchema>;

export const PluginCompatibilitySchema = z.object({
  os: z.array(z.enum(["win32", "linux", "darwin"])).optional().default(["win32", "linux", "darwin"]),
  node: z.string().optional().default(">=20.0.0"),
  runtime: z.string().optional().default("anantham>=2.0"),
  capabilities: z.array(z.string()).optional().default([]),
});
export type PluginCompatibility = z.infer<typeof PluginCompatibilitySchema>;

export const PluginDependencySchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  optional: z.boolean().optional().default(false),
});
export type PluginDependency = z.infer<typeof PluginDependencySchema>;

export const PluginManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9_\-\.]+$/, "Plugin ID must be alphanumeric with dashes, dots, or underscores"),
  name: z.string().min(1),
  version: z.string().min(1).regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9\.]+)?$/, "Version must follow semantic versioning (SemVer)"),
  description: z.string().optional(),
  publisher: z.string().optional().default("local"),
  classes: z.array(PluginClassSchema).optional().default(["tool"]),
  runtime: z.string().optional().default("anantham>=2.0"),
  provides: z.array(z.string()).optional().default([]),
  requires: z.array(z.string()).optional().default([]),
  dependencies: z.array(PluginDependencySchema).optional().default([]),
  permissions: PluginPermissionsSchema.optional().default({}),
  compatibility: PluginCompatibilitySchema.optional().default({}),
  checksum: z.string().min(1),
  stateVersion: z.number().int().nonnegative().optional().default(1),
  entrypoint: z.string().optional(),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export const PluginRecordSchema = z.object({
  manifest: PluginManifestSchema,
  trustState: PluginTrustStateSchema.default("unknown"),
  lifecycleState: PluginLifecycleStateSchema.default("discovered"),
  healthState: PluginHealthStateSchema.default("healthy"),
  installPath: z.string().optional(),
  installedAt: z.string().datetime().optional(),
  lastActivatedAt: z.string().datetime().optional(),
  activeRegistrations: z
    .object({
      tools: z.array(z.string()).default([]),
      commands: z.array(z.string()).default([]),
      hooks: z.array(z.string()).default([]),
      providers: z.array(z.string()).default([]),
    })
    .default({ tools: [], commands: [], hooks: [], providers: [] }),
  previousVersion: z
    .object({
      manifest: PluginManifestSchema,
      installPath: z.string().optional(),
      checksum: z.string(),
    })
    .optional(),
  projectPin: z.string().optional(),
});
export type PluginRecord = z.infer<typeof PluginRecordSchema>;

export const PluginPinMapSchema = z.record(z.string(), z.string());
export type PluginPinMap = z.infer<typeof PluginPinMapSchema>;
