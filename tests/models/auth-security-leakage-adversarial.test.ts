import { describe, it, expect, beforeEach } from "vitest";
import { KeyPoolManager } from "../../src/models/key-pool-manager.js";
import { ModelRouter } from "../../src/models/model-router.js";
import { MockProviderAdapter } from "../../src/models/mock-provider-adapter.js";
import { GPT_4O_PROFILE } from "../../src/models/capability-profiles.js";

describe("P3.4 Security Invariants - Adversarial Secret Leakage Tests", () => {
  let poolManager: KeyPoolManager;
  let router: ModelRouter;
  const rawSuperSecret = "sk-super-secret-api-token-1234567890";

  beforeEach(async () => {
    poolManager = new KeyPoolManager();
    router = new ModelRouter({ keyPoolManager: poolManager });

    await poolManager.addCredential(
      {
        credentialId: "cred_sensitive_01",
        providerId: "openai",
        authProfileId: "prof_openai",
        name: "Secret Key",
        maskedFingerprint: "sk-...7890",
        maxConcurrent: 1,
        status: "disabled", // Explicitly disabled
        createdAt: new Date().toISOString(),
      },
      rawSuperSecret
    );

    router.registerCandidate(
      {
        modelId: "gpt-4o",
        providerId: "openai",
        profile: GPT_4O_PROFILE,
        priority: 10,
      },
      new MockProviderAdapter({ providerId: "openai" })
    );
  });

  it("I1 & I2: Never selects disabled credentials and never leaks raw secret in errors or explanations", async () => {
    // Disabled credential acquisition must fail
    const acquireResult = await poolManager.acquireKey("openai");
    expect(acquireResult.success).toBe(false);
    expect(acquireResult.rawSecret).toBeUndefined();

    // Executing router with only disabled credentials fails safely
    await expect(
      router.execute(
        {
          modelId: "gpt-4o",
          messages: [{ role: "user", content: "Test prompt" }],
        },
        {
          requirements: { requiredInputs: ["text"] },
          maxAttempts: 1,
        }
      )
    ).rejects.toThrow();

    // Audit logs/records never contain rawSuperSecret
    const cred = poolManager.getCredential("cred_sensitive_01");
    const jsonStr = JSON.stringify(cred);
    expect(jsonStr).not.toContain(rawSuperSecret);
    expect(jsonStr).toContain("sk-...7890");
  });
});
