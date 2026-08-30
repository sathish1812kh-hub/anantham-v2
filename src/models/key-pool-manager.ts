import {
  type CredentialReference,
  type KeyLease,
  type KeyPool,
  CredentialReferenceSchema,
  KeyLeaseSchema,
  KeyPoolSchema,
} from "../domain/auth.js";
import { type SecretStore, InMemorySecretStore } from "./secret-store.js";
import { randomUUID } from "node:crypto";

export interface KeyAcquisitionResult {
  success: boolean;
  lease?: KeyLease;
  credential?: CredentialReference;
  rawSecret?: string;
  rejectionReason?: string;
}

export class KeyPoolManager {
  private pools: Map<string, KeyPool> = new Map();
  private credentials: Map<string, CredentialReference> = new Map();
  private activeLeases: Map<string, KeyLease> = new Map();
  private secretStore: SecretStore;

  constructor(secretStore?: SecretStore) {
    this.secretStore = secretStore || new InMemorySecretStore();
  }

  public registerPool(pool: KeyPool): void {
    const validated = KeyPoolSchema.parse(pool);
    this.pools.set(validated.providerId, validated);
  }

  public async addCredential(credential: CredentialReference, rawSecret?: string): Promise<void> {
    const validated = CredentialReferenceSchema.parse(credential);
    this.credentials.set(validated.credentialId, validated);

    if (rawSecret) {
      await this.secretStore.setSecret(validated.credentialId, rawSecret);
    }

    // Add to pool if pool exists
    const pool = this.pools.get(validated.providerId);
    if (pool) {
      const existingIdx = pool.members.findIndex((m) => m.credentialId === validated.credentialId);
      if (existingIdx >= 0) {
        pool.members[existingIdx] = validated;
      } else {
        pool.members.push(validated);
      }
    }
  }

  public getCredential(credentialId: string): CredentialReference | undefined {
    return this.credentials.get(credentialId);
  }

  public listCredentials(providerId?: string): CredentialReference[] {
    const all = Array.from(this.credentials.values());
    if (providerId) {
      return all.filter((c) => c.providerId === providerId);
    }
    return all;
  }

  /**
   * Deterministically selects an eligible credential and issues a KeyLease.
   */
  public async acquireKey(
    providerId: string,
    options: { ownerTaskId?: string } = {}
  ): Promise<KeyAcquisitionResult> {
    const pool = this.pools.get(providerId);
    const candidates = pool
      ? pool.members
      : Array.from(this.credentials.values()).filter((c) => c.providerId === providerId);

    if (candidates.length === 0) {
      return {
        success: false,
        rejectionReason: `No credentials configured for provider '${providerId}'`,
      };
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Filter eligible candidates
    const eligible: CredentialReference[] = [];

    for (const cred of candidates) {
      // Disabled / expired / invalid checks
      if (cred.status === "disabled" || cred.status === "expired" || cred.status === "invalid" || cred.status === "revoked") {
        continue;
      }

      // Cooldown check
      if (cred.cooldownUntil && new Date(cred.cooldownUntil) > now) {
        continue;
      }

      // Concurrency limit check
      if (cred.concurrencyCount >= cred.maxConcurrent) {
        continue;
      }

      eligible.push(cred);
    }

    if (eligible.length === 0) {
      return {
        success: false,
        rejectionReason: `All credentials for provider '${providerId}' are exhausted, in cooldown, or over concurrency limits`,
      };
    }

    // 2. Deterministic selection: least busy (lowest concurrencyCount)
    eligible.sort((a, b) => a.concurrencyCount - b.concurrencyCount);
    const selected = eligible[0];

    // 3. Acquire Lease
    const leaseId = `lease_${randomUUID().slice(0, 8)}`;
    const lease: KeyLease = KeyLeaseSchema.parse({
      leaseId,
      credentialId: selected.credentialId,
      providerId: selected.providerId,
      ownerTaskId: options.ownerTaskId,
      acquiredAt: nowIso,
      status: "active",
    });

    selected.concurrencyCount += 1;
    selected.lastUsedAt = nowIso;
    this.activeLeases.set(leaseId, lease);

    const rawSecret = await this.secretStore.getSecret(selected.credentialId);

    return {
      success: true,
      lease,
      credential: selected,
      rawSecret,
    };
  }

  /**
   * Releases an active key lease, updating concurrency and applying cooldown on error.
   */
  public releaseKey(
    leaseId: string,
    options: { isError?: boolean; cooldownMs?: number } = {}
  ): void {
    const lease = this.activeLeases.get(leaseId);
    if (!lease || lease.status !== "active") {
      return;
    }

    lease.status = "released";
    lease.releasedAt = new Date().toISOString();
    this.activeLeases.delete(leaseId);

    const cred = this.credentials.get(lease.credentialId);
    if (cred) {
      cred.concurrencyCount = Math.max(0, cred.concurrencyCount - 1);

      if (options.isError) {
        cred.failureCount += 1;
        if (options.cooldownMs && options.cooldownMs > 0) {
          cred.status = "cooldown";
          cred.cooldownUntil = new Date(Date.now() + options.cooldownMs).toISOString();
        }
      } else {
        cred.status = "available";
        cred.cooldownUntil = undefined;
        cred.failureCount = 0;
      }
    }
  }

  /**
   * Reclaims orphaned/stale leases after process crash or abnormal termination.
   */
  public reclaimStaleLeases(maxAgeMs = 60000): number {
    const now = Date.now();
    let reclaimed = 0;

    for (const [leaseId, lease] of this.activeLeases.entries()) {
      const age = now - new Date(lease.acquiredAt).getTime();
      if (age > maxAgeMs) {
        this.releaseKey(leaseId, { isError: true });
        reclaimed += 1;
      }
    }

    return reclaimed;
  }
}
