/**
 * Zero-Knowledge & Local-Only Execution Mode Enforcer
 * PRD-SEC-006: Zero-Knowledge & Local-Only Execution Modes
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface ZeroKnowledgeConfig {
  localOnly: boolean;
  enforceZeroKnowledge: boolean;
  encryptionKey?: Buffer;
  allowedOutboundHosts?: string[];
}

export class ZeroKnowledgeEnforcer {
  private config: ZeroKnowledgeConfig;
  private encryptionKey: Buffer;

  constructor(config: Partial<ZeroKnowledgeConfig> = {}) {
    this.config = {
      localOnly: config.localOnly ?? false,
      enforceZeroKnowledge: config.enforceZeroKnowledge ?? false,
      allowedOutboundHosts: config.allowedOutboundHosts ?? ["127.0.0.1", "localhost"],
    };
    this.encryptionKey = config.encryptionKey ?? randomBytes(32); // AES-256 key
  }

  public isLocalOnly(): boolean {
    return this.config.localOnly;
  }

  public isZeroKnowledge(): boolean {
    return this.config.enforceZeroKnowledge;
  }

  public validateNetworkEgress(targetUrl: string): { allowed: boolean; reason?: string } {
    if (!this.config.localOnly && !this.config.enforceZeroKnowledge) {
      return { allowed: true };
    }

    try {
      const url = new URL(targetUrl);
      const host = url.hostname.toLowerCase();

      // In local-only or ZK mode, only loopback addresses are allowed
      const isLoopback =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        (this.config.allowedOutboundHosts ?? []).includes(host);

      if (!isLoopback) {
        return {
          allowed: false,
          reason: `Zero-Knowledge / Local-Only mode active: External network egress to '${host}' strictly forbidden`,
        };
      }

      return { allowed: true };
    } catch {
      return {
        allowed: false,
        reason: `Invalid egress destination URL: '${targetUrl}'`,
      };
    }
  }

  public encryptLocalPayload(payload: string): { iv: string; authTag: string; ciphertext: string } {
    const iv = randomBytes(12); // GCM standard 12-byte IV
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    let ciphertext = cipher.update(payload, "utf-8", "hex");
    ciphertext += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    return {
      iv: iv.toString("hex"),
      authTag,
      ciphertext,
    };
  }

  public decryptLocalPayload(encrypted: { iv: string; authTag: string; ciphertext: string }): string {
    const iv = Buffer.from(encrypted.iv, "hex");
    const authTag = Buffer.from(encrypted.authTag, "hex");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted.ciphertext, "hex", "utf-8");
    decrypted += decipher.final("utf-8");
    return decrypted;
  }
}
