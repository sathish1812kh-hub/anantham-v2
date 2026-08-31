import { createHmac, timingSafeEqual } from "node:crypto";

export interface AuthVerifierOptions {
  secretKey?: string;
}

/**
 * Remote Authentication & Request Signature Verifier.
 * PRD Part 2 Section 145 & 161.
 */
export class RemoteAuthVerifier {
  private readonly secretKey: string;

  constructor(options: AuthVerifierOptions = {}) {
    this.secretKey = options.secretKey ?? "anantham-default-node-secret-v2";
  }

  /**
   * Compute HMAC-SHA256 signature for a payload.
   */
  public signPayload(payload: unknown): string {
    const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
    return createHmac("sha256", this.secretKey).update(serialized).digest("hex");
  }

  /**
   * Verify HMAC-SHA256 signature using timing-safe comparison.
   */
  public verifySignature(payload: unknown, signature: string): boolean {
    if (!signature) return false;
    const expected = this.signPayload(payload);
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(signature, "hex");

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, actualBuf);
  }

  /**
   * Validate project isolation scope.
   */
  public isProjectAllowed(projectScope: string[], targetProjectId: string): boolean {
    if (projectScope.includes("*")) {
      return true;
    }
    return projectScope.includes(targetProjectId);
  }
}
