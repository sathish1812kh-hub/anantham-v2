import { z } from "zod";

/**
 * Credential lifecycle states.
 * PRD Part 3 Section 141-145.
 */
export const CredentialStatusSchema = z.enum([
  "configured",
  "available",
  "cooldown",
  "rate_limited",
  "unhealthy",
  "disabled",
  "expired",
  "revoked",
  "invalid",
]);
export type CredentialStatus = z.infer<typeof CredentialStatusSchema>;

/**
 * Safe metadata for a provider credential (without the raw secret).
 * Critical Invariant: Raw secrets must never enter this contract.
 */
export const CredentialReferenceSchema = z.object({
  credentialId: z.string().min(1),
  providerId: z.string().min(1),
  authProfileId: z.string().min(1),
  name: z.string().min(1),
  maskedFingerprint: z.string().min(1), // e.g. "sk-...1234"
  status: CredentialStatusSchema.default("available"),
  maxConcurrent: z.number().int().positive().default(1),
  concurrencyCount: z.number().int().nonnegative().default(0),
  rateLimitRpm: z.number().int().positive().optional(),
  cooldownUntil: z.string().optional(),
  failureCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().min(1),
  lastUsedAt: z.string().optional(),
});
export type CredentialReference = z.infer<typeof CredentialReferenceSchema>;

/**
 * AuthProfile grouping credentials for a specific provider.
 */
export const AuthProfileSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  name: z.string().min(1),
  authType: z.enum(["api_key", "bearer_token", "oauth", "custom"]).default("api_key"),
  credentialIds: z.array(z.string()).default([]),
  status: z.enum(["active", "disabled", "deprecated"]).default("active"),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type AuthProfile = z.infer<typeof AuthProfileSchema>;

/**
 * Active lease representing safe concurrent key usage.
 */
export const KeyLeaseSchema = z.object({
  leaseId: z.string().min(1),
  credentialId: z.string().min(1),
  providerId: z.string().min(1),
  ownerTaskId: z.string().optional(),
  acquiredAt: z.string().min(1),
  releasedAt: z.string().optional(),
  status: z.enum(["active", "released", "expired"]).default("active"),
});
export type KeyLease = z.infer<typeof KeyLeaseSchema>;

/**
 * Key Pool managing multiple credential members for a provider.
 */
export const KeyPoolSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  name: z.string().min(1),
  members: z.array(CredentialReferenceSchema).default([]),
  maxTotalConcurrent: z.number().int().positive().default(5),
  selectionStrategy: z.enum(["least_busy", "round_robin", "priority"]).default("least_busy"),
});
export type KeyPool = z.infer<typeof KeyPoolSchema>;

/**
 * Independent Health Status for Providers and Models.
 */
export const HealthStatusSchema = z.enum(["healthy", "degraded", "unavailable", "unknown"]);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const ProviderHealthStatusSchema = z.object({
  providerId: z.string().min(1),
  status: HealthStatusSchema.default("healthy"),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  lastCheckedAt: z.string().min(1),
  reason: z.string().optional(),
});
export type ProviderHealthStatus = z.infer<typeof ProviderHealthStatusSchema>;

export const ModelHealthStatusSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  status: HealthStatusSchema.default("healthy"),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  lastCheckedAt: z.string().min(1),
  reason: z.string().optional(),
});
export type ModelHealthStatus = z.infer<typeof ModelHealthStatusSchema>;
