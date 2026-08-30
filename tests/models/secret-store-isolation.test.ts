import { describe, it, expect } from "vitest";
import { InMemorySecretStore, maskSecret } from "../../src/models/secret-store.js";
import { CredentialReferenceSchema } from "../../src/domain/auth.js";

describe("SecretStore - Secure Isolation & Fingerprinting", () => {
  it("stores and retrieves raw secrets in private store", async () => {
    const store = new InMemorySecretStore();
    await store.setSecret("cred_01", "sk-secret-key-12345678");

    expect(await store.hasSecret("cred_01")).toBe(true);
    expect(await store.getSecret("cred_01")).toBe("sk-secret-key-12345678");

    await store.deleteSecret("cred_01");
    expect(await store.hasSecret("cred_01")).toBe(false);
  });

  it("masks secret fingerprints safely", () => {
    const masked = maskSecret("sk-proj-abc123xyz789");
    expect(masked).toBe("sk-...z789");
    expect(masked).not.toContain("abc123xyz");
  });

  it("CRITICAL INVARIANT: CredentialReference never serializes or contains the raw secret", () => {
    const rawSecret = "sk-live-super-secret-key-9999";
    const ref = CredentialReferenceSchema.parse({
      credentialId: "cred_02",
      providerId: "openai",
      authProfileId: "prof_01",
      name: "Production OpenAI",
      maskedFingerprint: maskSecret(rawSecret),
      createdAt: new Date().toISOString(),
    });

    const serialized = JSON.stringify(ref);
    expect(serialized).not.toContain(rawSecret);
    expect(serialized).toContain("sk-...9999");
  });
});
