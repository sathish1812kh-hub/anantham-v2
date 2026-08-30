import { describe, it, expect, beforeEach } from "vitest";
import { KeyPoolManager } from "../../src/models/key-pool-manager.js";

describe("KeyPoolManager - Concurrency & Lease Lifecycle", () => {
  let poolManager: KeyPoolManager;

  beforeEach(async () => {
    poolManager = new KeyPoolManager();

    // Register a key pool with maxConcurrent = 2
    await poolManager.addCredential(
      {
        credentialId: "cred_openai_01",
        providerId: "openai",
        authProfileId: "prof_openai",
        name: "Key 1 (Concurrency: 2)",
        maskedFingerprint: "sk-...0001",
        maxConcurrent: 2,
        status: "available",
        createdAt: new Date().toISOString(),
      },
      "sk-real-secret-key-1"
    );

    // Second key with maxConcurrent = 1
    await poolManager.addCredential(
      {
        credentialId: "cred_openai_02",
        providerId: "openai",
        authProfileId: "prof_openai",
        name: "Key 2 (Concurrency: 1)",
        maskedFingerprint: "sk-...0002",
        maxConcurrent: 1,
        status: "available",
        createdAt: new Date().toISOString(),
      },
      "sk-real-secret-key-2"
    );
  });

  it("acquires leases respecting per-key concurrency limits and selects least busy key", async () => {
    // 1st acquisition -> Key 1
    const res1 = await poolManager.acquireKey("openai");
    expect(res1.success).toBe(true);
    expect(res1.credential?.credentialId).toBe("cred_openai_01");

    // 2nd acquisition -> Key 2 (because Key 2 concurrencyCount is 0, Key 1 is 1)
    const res2 = await poolManager.acquireKey("openai");
    expect(res2.success).toBe(true);
    expect(res2.credential?.credentialId).toBe("cred_openai_02");

    // 3rd acquisition -> Key 1 (Key 1 concurrency is 1, max is 2; Key 2 is full at 1/1)
    const res3 = await poolManager.acquireKey("openai");
    expect(res3.success).toBe(true);
    expect(res3.credential?.credentialId).toBe("cred_openai_01");

    // 4th acquisition -> Exhausted! (Total pool capacity 3 is saturated)
    const res4 = await poolManager.acquireKey("openai");
    expect(res4.success).toBe(false);
    expect(res4.rejectionReason).toContain("exhausted");

    // Release res1 lease
    poolManager.releaseKey(res1.lease!.leaseId, { isError: false });

    // 5th acquisition -> Now succeeds using Key 1
    const res5 = await poolManager.acquireKey("openai");
    expect(res5.success).toBe(true);
    expect(res5.credential?.credentialId).toBe("cred_openai_01");
  });

  it("reclaims stale leases after simulated crash/timeout", async () => {
    const res1 = await poolManager.acquireKey("openai");
    expect(res1.success).toBe(true);

    // Artificially age the lease to 10 minutes ago
    res1.lease!.acquiredAt = new Date(Date.now() - 600000).toISOString();

    const reclaimedCount = poolManager.reclaimStaleLeases(300000); // 5 min max age
    expect(reclaimedCount).toBe(1);

    const cred = poolManager.getCredential("cred_openai_01");
    expect(cred?.concurrencyCount).toBe(0);
  });
});
