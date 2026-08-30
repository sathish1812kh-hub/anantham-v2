import {
  type HealthStatus,
  type ProviderHealthStatus,
  type ModelHealthStatus,
  ProviderHealthStatusSchema,
  ModelHealthStatusSchema,
} from "../domain/auth.js";
import { ProviderUnavailableError } from "./model-errors.js";

/**
 * Independent health tracking for AI Providers and Models.
 * PRD Part 3 Section 142.
 */
export class ProviderHealthTracker {
  private providerHealth: Map<string, ProviderHealthStatus> = new Map();
  private modelHealth: Map<string, ModelHealthStatus> = new Map();

  public getProviderHealth(providerId: string): ProviderHealthStatus {
    const existing = this.providerHealth.get(providerId);
    if (existing) return existing;

    const initial: ProviderHealthStatus = {
      providerId,
      status: "healthy",
      consecutiveFailures: 0,
      lastCheckedAt: new Date().toISOString(),
    };
    this.providerHealth.set(providerId, initial);
    return initial;
  }

  public getModelHealth(providerId: string, modelId: string): ModelHealthStatus {
    const key = `${providerId}:${modelId}`;
    const existing = this.modelHealth.get(key);
    if (existing) return existing;

    const initial: ModelHealthStatus = {
      providerId,
      modelId,
      status: "healthy",
      consecutiveFailures: 0,
      lastCheckedAt: new Date().toISOString(),
    };
    this.modelHealth.set(key, initial);
    return initial;
  }

  public setProviderHealth(providerId: string, status: HealthStatus, reason?: string): void {
    const current = this.getProviderHealth(providerId);
    const updated = ProviderHealthStatusSchema.parse({
      ...current,
      status,
      reason,
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: status === "healthy" ? 0 : current.consecutiveFailures,
    });
    this.providerHealth.set(providerId, updated);
  }

  public setModelHealth(providerId: string, modelId: string, status: HealthStatus, reason?: string): void {
    const key = `${providerId}:${modelId}`;
    const current = this.getModelHealth(providerId, modelId);
    const updated = ModelHealthStatusSchema.parse({
      ...current,
      status,
      reason,
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: status === "healthy" ? 0 : current.consecutiveFailures,
    });
    this.modelHealth.set(key, updated);
  }

  public recordSuccess(providerId: string, modelId?: string): void {
    const prov = this.getProviderHealth(providerId);
    this.providerHealth.set(
      providerId,
      ProviderHealthStatusSchema.parse({
        ...prov,
        status: "healthy",
        consecutiveFailures: 0,
        lastCheckedAt: new Date().toISOString(),
        reason: undefined,
      })
    );

    if (modelId) {
      const mod = this.getModelHealth(providerId, modelId);
      const key = `${providerId}:${modelId}`;
      this.modelHealth.set(
        key,
        ModelHealthStatusSchema.parse({
          ...mod,
          status: "healthy",
          consecutiveFailures: 0,
          lastCheckedAt: new Date().toISOString(),
          reason: undefined,
        })
      );
    }
  }

  public recordFailure(
    providerId: string,
    modelId: string | undefined,
    error: Error,
    failureThreshold = 3
  ): void {
    const isOutage = error instanceof ProviderUnavailableError;
    const prov = this.getProviderHealth(providerId);
    const failures = prov.consecutiveFailures + 1;

    let newStatus: HealthStatus = prov.status;
    if (isOutage || failures >= failureThreshold) {
      newStatus = failures >= failureThreshold * 2 ? "unavailable" : "degraded";
    }

    this.providerHealth.set(
      providerId,
      ProviderHealthStatusSchema.parse({
        ...prov,
        status: newStatus,
        consecutiveFailures: failures,
        lastCheckedAt: new Date().toISOString(),
        reason: error.message,
      })
    );

    if (modelId) {
      const mod = this.getModelHealth(providerId, modelId);
      const modFailures = mod.consecutiveFailures + 1;
      const modStatus: HealthStatus = modFailures >= failureThreshold ? "degraded" : "healthy";
      const key = `${providerId}:${modelId}`;
      this.modelHealth.set(
        key,
        ModelHealthStatusSchema.parse({
          ...mod,
          status: modStatus,
          consecutiveFailures: modFailures,
          lastCheckedAt: new Date().toISOString(),
          reason: error.message,
        })
      );
    }
  }
}
