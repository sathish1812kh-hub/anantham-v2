import { describe, it, expect } from "vitest";
import { QuotaRateLimiter } from "../../src/saas/quota-rate-limiter.js";

describe("PRD-SAAS-005: Resource Quotas, Rate Limiting & Metering", () => {
  const limiter = new QuotaRateLimiter();

  it("enforces sliding rate limit per minute", () => {
    limiter.setTenantQuota({
      tenantId: "tenant_rate",
      maxRequestsPerMinute: 2,
      maxMonthlyTokens: 100_000,
      usedTokens: 0,
    });

    expect(limiter.checkRateLimit("tenant_rate").allowed).toBe(true);
    expect(limiter.checkRateLimit("tenant_rate").allowed).toBe(true);
    // 3rd request exceeds limit of 2
    const blocked = limiter.checkRateLimit("tenant_rate");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remainingRequests).toBe(0);
  });

  it("enforces monthly token budget quota", () => {
    limiter.setTenantQuota({
      tenantId: "tenant_tokens",
      maxRequestsPerMinute: 100,
      maxMonthlyTokens: 50_000,
      usedTokens: 40_000,
    });

    // 5k tokens allowed
    const res1 = limiter.recordTokenUsage("tenant_tokens", 5_000);
    expect(res1.allowed).toBe(true);
    expect(res1.remainingTokens).toBe(5_000);

    // 10k tokens exceeds remaining 5k
    const res2 = limiter.recordTokenUsage("tenant_tokens", 10_000);
    expect(res2.allowed).toBe(false);
    expect(res2.remainingTokens).toBe(5_000);
  });
});
