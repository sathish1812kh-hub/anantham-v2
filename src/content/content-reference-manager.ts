import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface StoredBlobDescriptor {
  uri: string;
  sha256: string;
  sizeBytes: number;
}

export class ContentReferenceManager {
  private static defaultStorageDir = resolve(process.cwd(), ".anantham", "content_blobs");

  public static setStorageDir(dir: string): void {
    ContentReferenceManager.defaultStorageDir = resolve(dir);
  }

  public static getStorageDir(): string {
    return ContentReferenceManager.defaultStorageDir;
  }

  /**
   * Stores a large payload to persistent file storage, returning its SHA-256 digest and URI.
   * PRD Part 1 Section 10 & PRD Part 3 Section 139.
   */
  public static storeBlob(data: Buffer, customDir?: string): StoredBlobDescriptor {
    const sha256 = createHash("sha256").update(data).digest("hex");
    const targetDir = customDir ? resolve(customDir) : ContentReferenceManager.defaultStorageDir;

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const filePath = join(targetDir, `blob_${sha256}.bin`);
    writeFileSync(filePath, data);

    return {
      uri: `file:///${filePath.replace(/\\/g, "/")}`,
      sha256,
      sizeBytes: data.length,
    };
  }

  /**
   * Reads a stored content blob and strictly verifies its cryptographic SHA-256 checksum.
   */
  public static readBlob(uri: string, expectedSha256?: string): Buffer {
    const rawPath = uri.replace(/^file:\/\/\/?/, "");
    // On Windows handle drive letters properly
    const filePath = /^[a-zA-Z]:/.test(rawPath) ? rawPath : `/${rawPath}`;

    if (!existsSync(filePath)) {
      throw new Error(`Content blob at '${uri}' does not exist on disk.`);
    }

    const buffer = readFileSync(filePath);
    if (expectedSha256) {
      const actualSha = createHash("sha256").update(buffer).digest("hex");
      if (actualSha !== expectedSha256) {
        throw new Error(
          `Content blob integrity failure: expected SHA-256 '${expectedSha256}', received '${actualSha}'.`
        );
      }
    }

    return buffer;
  }

  /**
   * Verifies whether a blob exists and matches the expected SHA-256 hash.
   */
  public static verifyBlob(uri: string, expectedSha256: string): boolean {
    try {
      ContentReferenceManager.readBlob(uri, expectedSha256);
      return true;
    } catch {
      return false;
    }
  }
}
