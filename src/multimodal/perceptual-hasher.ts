/**
 * Multimodal Perceptual Image Hasher & Cache
 * PRD-MM-006: Multimodal Memory & Caching
 */

import { createHash } from "node:crypto";

export interface CachedMultimodalItem {
  id: string;
  hash: string;
  data: unknown;
  lastAccessed: number;
}

export class PerceptualHasher {
  private cache: Map<string, CachedMultimodalItem> = new Map();

  /**
   * Computes difference hash (dHash) from byte buffer
   * Samples 64 bits based on consecutive byte gradient
   */
  public computeDHash(buffer: Buffer): string {
    if (buffer.length === 0) return "0".repeat(16);

    const step = Math.max(1, Math.floor(buffer.length / 64));
    let binary = "";

    for (let i = 0; i < 64; i++) {
      const idx1 = i * step;
      const idx2 = Math.min(buffer.length - 1, (i + 1) * step);
      const val1 = buffer[idx1] ?? 0;
      const val2 = buffer[idx2] ?? 0;
      binary += val1 > val2 ? "1" : "0";
    }

    // Convert 64-bit binary to 16 hex chars
    let hex = "";
    for (let i = 0; i < binary.length; i += 4) {
      hex += parseInt(binary.slice(i, i + 4), 2).toString(16);
    }

    return hex;
  }

  public computeSha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  public hammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      return 64; // Max distance on length mismatch
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      const n1 = parseInt(hash1[i] ?? "0", 16);
      const n2 = parseInt(hash2[i] ?? "0", 16);
      let xor = n1 ^ n2;
      while (xor > 0) {
        distance += xor & 1;
        xor >>= 1;
      }
    }

    return distance;
  }

  public store(id: string, buffer: Buffer, data: unknown): string {
    const hash = this.computeDHash(buffer);
    this.cache.set(hash, {
      id,
      hash,
      data,
      lastAccessed: Date.now(),
    });
    return hash;
  }

  public lookupSimilar(buffer: Buffer, maxDistance = 5): CachedMultimodalItem | null {
    const queryHash = this.computeDHash(buffer);

    for (const item of this.cache.values()) {
      const dist = this.hammingDistance(queryHash, item.hash);
      if (dist <= maxDistance) {
        item.lastAccessed = Date.now();
        return item;
      }
    }

    return null;
  }

  public clear(): void {
    this.cache.clear();
  }
}
