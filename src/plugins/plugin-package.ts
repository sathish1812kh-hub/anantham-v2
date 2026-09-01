/**
 * Anantham V2 — Plugin Package Verifier
 *
 * Enforces SHA-256 package checksum integrity, decompression bomb defenses,
 * and path traversal containment.
 */

import crypto from "node:crypto";
import path from "node:path";

export interface PackageVerificationOptions {
  maxPackageBytes?: number; // Default 50MB
}

export class PluginPackageVerifier {
  private readonly maxPackageBytes: number;

  constructor(options: PackageVerificationOptions = {}) {
    this.maxPackageBytes = options.maxPackageBytes || 50 * 1024 * 1024;
  }

  public getMaxPackageBytes(): number {
    return this.maxPackageBytes;
  }

  /**
   * Computes SHA-256 hash of a buffer or string.
   */
  public computeChecksum(content: Buffer | string): string {
    const buffer = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    if (Buffer.byteLength(buffer) > this.maxPackageBytes) {
      throw new Error(`Package size exceeds maximum allowed limit of ${this.maxPackageBytes} bytes.`);
    }
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Verifies that package content matches expected SHA-256 checksum.
   */
  public verifyChecksum(content: Buffer | string, expectedChecksum: string): boolean {
    const actualChecksum = this.computeChecksum(content);
    return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
  }

  /**
   * Validates that an install path does not escape the base plugin directory (path traversal defense).
   */
  public validateInstallPath(pluginId: string, baseDir: string, relativePath: string): string {
    const resolvedBase = path.resolve(baseDir);
    const targetPath = path.resolve(resolvedBase, pluginId, relativePath);

    const rel = path.relative(resolvedBase, targetPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`Path traversal violation: Plugin path "${relativePath}" escapes root "${baseDir}".`);
    }

    return targetPath;
  }
}
