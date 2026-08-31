import { describe, it, expect } from "vitest";
import { RemoteAuthVerifier } from "../../src/remote/remote-auth-verifier.js";

describe("P7.4 Remote Nodes — Authenticated Communication & Cryptographic Signatures", () => {
  const authVerifier = new RemoteAuthVerifier({ secretKey: "test-secret-key-12345" });

  it("signs and verifies payload successfully", () => {
    const payload = {
      dispatchId: "disp_01",
      nodeId: "node_01",
      taskId: "task_01",
      generation: 1,
      status: "SUCCESS",
    };

    const signature = authVerifier.signPayload(payload);
    expect(typeof signature).toBe("string");
    expect(signature.length).toBe(64); // SHA-256 hex string

    const isValid = authVerifier.verifySignature(payload, signature);
    expect(isValid).toBe(true);
  });

  it("rejects tampered payloads", () => {
    const originalPayload = {
      dispatchId: "disp_01",
      generation: 1,
      status: "SUCCESS",
    };

    const signature = authVerifier.signPayload(originalPayload);

    // Tamper with generation token
    const tamperedPayload = {
      dispatchId: "disp_01",
      generation: 2, // Tampered!
      status: "SUCCESS",
    };

    const isValid = authVerifier.verifySignature(tamperedPayload, signature);
    expect(isValid).toBe(false);
  });

  it("validates project containment rules with wildcards and specific IDs", () => {
    expect(authVerifier.isProjectAllowed(["*"], "any_proj")).toBe(true);
    expect(authVerifier.isProjectAllowed(["proj_1", "proj_2"], "proj_1")).toBe(true);
    expect(authVerifier.isProjectAllowed(["proj_1", "proj_2"], "proj_3")).toBe(false);
  });
});
