import { describe, it, expect } from "vitest";
import {
  AuthProfileSchema,
  CredentialReferenceSchema,
  KeyLeaseSchema,
  KeyPoolSchema,
  ProviderHealthStatusSchema,
  ModelHealthStatusSchema,
} from "../../src/domain/auth.js";

describe("Auth Domain Contracts - Schema Validation", () => {
  it("validates CredentialReferenceSchema with default values", () => {
    const cred = {
      credentialId: "cred_01",
      providerId: "openai",
      authProfileId: "prof_01",
      name: "Primary OpenAI Key",
      maskedFingerprint: "sk-...1234",
      createdAt: new Date().toISOString(),
    };

    const parsed = CredentialReferenceSchema.parse(cred);
    expect(parsed.credentialId).toBe("cred_01");
    expect(parsed.status).toBe("available");
    expect(parsed.maxConcurrent).toBe(1);
    expect(parsed.concurrencyCount).toBe(0);
    expect(parsed.failureCount).toBe(0);
  });

  it("validates AuthProfileSchema", () => {
    const profile = {
      id: "prof_01",
      providerId: "anthropic",
      name: "Anthropic Team Profile",
      credentialIds: ["cred_01", "cred_02"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = AuthProfileSchema.parse(profile);
    expect(parsed.id).toBe("prof_01");
    expect(parsed.authType).toBe("api_key");
    expect(parsed.status).toBe("active");
  });

  it("validates KeyLeaseSchema", () => {
    const lease = {
      leaseId: "lease_01",
      credentialId: "cred_01",
      providerId: "openai",
      acquiredAt: new Date().toISOString(),
    };

    const parsed = KeyLeaseSchema.parse(lease);
    expect(parsed.leaseId).toBe("lease_01");
    expect(parsed.status).toBe("active");
  });

  it("validates KeyPoolSchema", () => {
    const pool = {
      id: "pool_openai",
      providerId: "openai",
      name: "OpenAI Shared Pool",
      members: [],
      maxTotalConcurrent: 10,
    };

    const parsed = KeyPoolSchema.parse(pool);
    expect(parsed.id).toBe("pool_openai");
    expect(parsed.selectionStrategy).toBe("least_busy");
  });

  it("validates ProviderHealthStatusSchema and ModelHealthStatusSchema", () => {
    const provHealth = ProviderHealthStatusSchema.parse({
      providerId: "openai",
      status: "healthy",
      lastCheckedAt: new Date().toISOString(),
    });
    expect(provHealth.status).toBe("healthy");

    const modHealth = ModelHealthStatusSchema.parse({
      providerId: "openai",
      modelId: "gpt-4o",
      status: "degraded",
      consecutiveFailures: 2,
      lastCheckedAt: new Date().toISOString(),
      reason: "High latency observed",
    });
    expect(modHealth.status).toBe("degraded");
    expect(modHealth.consecutiveFailures).toBe(2);
  });
});
