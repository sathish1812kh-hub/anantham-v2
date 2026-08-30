import { describe, it, expect, beforeEach } from "vitest";
import { KeyPoolManager } from "../../src/models/key-pool-manager.js";

describe("KeyPoolManager - Rate Limiting & Cooldown Lifecycle", () => {
  let poolManager: KeyPoolManager;

  beforeEach(async () => {
    poolManager = new KeyPoolManager();

    await poolManager.addCredential(
      {
        credentialId: "cred_cooldown_01",
        providerId: "anthropic",
        authProfileId: "prof_anthropic",
        name: "Anthropic Key 1",
        maskedFingerprint: "sk-...1111",
        maxConcurrent: 1,
        status: "available",
        createdAt: new Date().toISOString(),
      },
      "sk-ant-secret-1"
    );

    await poolManager.addCredential(
      {
        credentialId: "cred_cooldown_02",
        providerId: "anthropic",
        authProfileId: "prof_anthropic",
        name: "Anthropic Key 2",
        maskedFingerprint: "sk-...2222",
        maxConcurrent: 1,
        status: "available",
        createdAt: new Date().toISOString(),
      },
      "sk-ant-secret-2"
    );
  });

  it("places failing key into cooldown on error release without affecting sibling key", async () => {
    const res1 = await poolManager.acquireKey("anthropic");
    expect(res1.credential?.credentialId).toBe("cred_cooldown_01");

    // Release with transient error (5000ms cooldown)
    poolManager.releaseKey(res1.lease!.leaseId, { isError: true, cooldownMs: 5000 });

    const cred1 = poolManager.getCredential("cred_cooldown_01");
    expect(cred1?.status).toBe("cooldown");
    expect(cred1?.cooldownUntil).toBeDefined();

    // Next acquisition automatically selects healthy sibling Key 2
    const res2 = await poolManager.acquireKey("anthropic");
    expect(res2.success).toBe(true);
    expect(res2.credential?.credentialId).toBe("cred_cooldown_02");

    // Key 1 is not selected while in cooldown
    poolManager.releaseKey(res2.lease!.leaseId, { isError: false });
    const res3 = await poolManager.acquireKey("anthropic");
    expect(res3.credential?.credentialId).toBe("cred_cooldown_02");
  });
});
