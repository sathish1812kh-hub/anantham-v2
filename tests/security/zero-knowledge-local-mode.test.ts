import { describe, it, expect } from "vitest";
import { ZeroKnowledgeEnforcer } from "../../src/security/zero-knowledge-enforcer.js";

describe("PRD-SEC-006: Zero-Knowledge & Local-Only Execution Modes", () => {
  it("blocks outbound network egress to external hosts while permitting local loopback in local-only mode", () => {
    const enforcer = new ZeroKnowledgeEnforcer({ localOnly: true });

    // Local loopback allowed
    expect(enforcer.validateNetworkEgress("http://localhost:8080/api").allowed).toBe(true);
    expect(enforcer.validateNetworkEgress("http://127.0.0.1:3000/health").allowed).toBe(true);

    // External outbound blocked
    const externalCheck = enforcer.validateNetworkEgress("https://api.openai.com/v1/chat");
    expect(externalCheck.allowed).toBe(false);
    expect(externalCheck.reason).toContain("Zero-Knowledge / Local-Only mode active");

    const telemetryCheck = enforcer.validateNetworkEgress("https://telemetry.segment.io/v1/track");
    expect(telemetryCheck.allowed).toBe(false);
  });

  it("encrypts and decrypts sensitive local payloads using AES-256-GCM authenticated encryption", () => {
    const enforcer = new ZeroKnowledgeEnforcer({ enforceZeroKnowledge: true });
    const originalText = "SECRET_API_TOKEN_998877665544";

    const encrypted = enforcer.encryptLocalPayload(originalText);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.ciphertext).not.toBe(originalText);
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.iv).toBeDefined();

    const decrypted = enforcer.decryptLocalPayload(encrypted);
    expect(decrypted).toBe(originalText);
  });
});
