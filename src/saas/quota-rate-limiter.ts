/**
 * Resource Quotas, Rate Limiting & Metering Engine
 * PRD-SAAS-005: Resource Quotas, Rate Limiting & Metering
 */

export interface TenantQuota {
  tenantId: string;
  maxRequestsPerMinute: number;
  maxMonthlyTokens: number;
  usedTokens: number;
}

export class QuotaRateLimiter {
  private quotas: Map<string, TenantQuota> = new Map();
  private requestBuckets: Map<string, { count: number; windowStart: number }> = new Map();

  public setTenantQuota(quota: TenantQuota): void {
    this.quotas.set(quota.tenantId, quota);
  }

  public checkRateLimit(tenantId: string): { allowed: boolean; remainingRequests: number; resetMs: number } {
    const quota = this.quotas.get(tenantId);
    const limit = quota?.maxRequestsPerMinute ?? 60;
    const now = Date.now();

    const bucket = this.requestBuckets.get(tenantId) ?? { count: 0, windowStart: now };

    if (now - bucket.windowStart >= 60000) {
      bucket.count = 0;
      bucket.windowStart = now;
    }

    if (bucket.count >= limit) {
      return {
        allowed: false,
        remainingRequests: 0,
        resetMs: 60000 - (now - bucket.windowStart),
      };
    }

    bucket.count++;
    this.requestBuckets.set(tenantId, bucket);

    return {
      allowed: true,
      remainingRequests: limit - bucket.count,
      resetMs: 60000 - (now - bucket.windowStart),
    };
  }

  public recordTokenUsage(tenantId: string, tokens: number): { allowed: boolean; remainingTokens: number } {
    const quota = this.quotas.get(tenantId);
    if (!quota) {
      return { allowed: true, remainingTokens: Infinity };
    }

    if (quota.usedTokens + tokens > quota.maxMonthlyTokens) {
      return {
        allowed: false,
        remainingTokens: Math.max(0, quota.maxMonthlyTokens - quota.usedTokens),
      };
    }

    quota.usedTokens += tokens;
    return {
      allowed: true,
      remainingTokens: quota.maxMonthlyTokens - quota.usedTokens,
    };
  }
}
