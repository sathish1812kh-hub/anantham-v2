import fs from "node:fs";
import crypto from "node:crypto";
import {
  type FileDivergenceRecord,
} from "../domain/side-effect.js";

/**
 * Anantham V2 — File Divergence Detector
 * Playbook Section 59 & Section 138 (User Change Protection)
 */
export class FileDivergenceDetector {
  public computeFileHash(filePath: string): string | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = fs.readFileSync(filePath);
      return crypto.createHash("sha256").update(content).digest("hex");
    } catch {
      return null;
    }
  }

  public detectDivergence(filePath: string, baseHash: string | null): FileDivergenceRecord {
    const currentHash = this.computeFileHash(filePath);
    const now = new Date().toISOString();

    if (baseHash === null && currentHash === null) {
      return {
        filePath,
        baseHash: "none",
        currentHash: "none",
        status: "synced",
        detectedAt: now,
      };
    }

    if (baseHash === null && currentHash !== null) {
      return {
        filePath,
        baseHash: "none",
        currentHash,
        status: "file_created",
        detectedAt: now,
      };
    }

    if (baseHash !== null && currentHash === null) {
      return {
        filePath,
        baseHash,
        currentHash: "none",
        status: "file_missing",
        detectedAt: now,
      };
    }

    if (baseHash !== null && currentHash !== null) {
      if (baseHash === currentHash) {
        return {
          filePath,
          baseHash,
          currentHash,
          status: "synced",
          detectedAt: now,
        };
      } else {
        return {
          filePath,
          baseHash,
          currentHash,
          status: "diverged",
          detectedAt: now,
        };
      }
    }

    return {
      filePath,
      baseHash: baseHash || "none",
      currentHash: currentHash || "none",
      status: "diverged",
      detectedAt: now,
    };
  }

  public assertNoDivergence(filePath: string, baseHash: string | null): void {
    const record = this.detectDivergence(filePath, baseHash);
    if (record.status === "diverged") {
      throw new Error(
        `FILE_DIVERGENCE_DETECTED: Target file "${filePath}" was modified externally since base hash "${baseHash}". Write aborted to prevent destroying user changes.`
      );
    }
  }
}
