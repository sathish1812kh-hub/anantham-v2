import { describe, it, expect } from "vitest";
import { RemoteAuthVerifier } from "../../src/remote/remote-auth-verifier.js";

describe("W-P10.5-04 RemoteAuthVerifier Canonical JSON Signing", () => {
  const verifier = new RemoteAuthVerifier({ secretKey: "secret-key-test" });

  it("verifies signatures identically regardless of object key order", () => {
    const payloadA = {
      dispatchId: "disp_123",
      generation: 2,
      nodeId: "node_A",
      status: "SUCCESS",
    };

    const payloadB = {
      status: "SUCCESS",
      nodeId: "node_A",
      dispatchId: "disp_123",
      generation: 2,
    };

    const signatureA = verifier.signPayload(payloadA);
    const signatureB = verifier.signPayload(payloadB);

    // Signatures must be bit-identical due to canonicalization
    expect(signatureA).toBe(signatureB);

    // Verifying payloadB with signatureA succeeds
    expect(verifier.verifySignature(payloadB, signatureA)).toBe(true);
  });
});
