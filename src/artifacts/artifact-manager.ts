import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Artifact, ArtifactType, ArtifactVerification } from "../domain/artifact.js";
import { ArtifactSchema } from "../domain/artifact.js";
import type { ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import { ArtifactReferenceValidator, type ArtifactAccessContext } from "./artifact-reference-validator.js";

export class ArtifactIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactIntegrityError";
  }
}

export class ArtifactAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactAccessDeniedError";
  }
}

export class ArtifactNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactNotFoundError";
  }
}

export interface CreateArtifactParams {
  id?: string;
  type: ArtifactType | string;
  data: Buffer | string;
  projectId?: string;
  sessionId?: string;
  taskId?: string;
  agentId?: string;
  sourceEventIds?: string[];
  metadata?: Record<string, unknown>;
  filename?: string;
}

export class ArtifactManager {
  private readonly repository: ArtifactRepository;
  private readonly storageDir: string;

  constructor(repository: ArtifactRepository, storageDir = ".anantham/artifacts") {
    this.repository = repository;
    this.storageDir = resolve(storageDir);

    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Creates an artifact with atomic durable write, cryptographic SHA-256 digest,
   * and SQLite metadata persistence.
   * PRD Part 1 Section 97.
   */
  public async createArtifact(params: CreateArtifactParams): Promise<Artifact> {
    const buffer = Buffer.isBuffer(params.data) ? params.data : Buffer.from(params.data, "utf8");
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const id = params.id || `art_${sha256.slice(0, 16)}`;
    const now = new Date().toISOString();

    const fileName = params.filename || `${id}_${sha256.slice(0, 8)}.dat`;
    const targetPath = join(this.storageDir, fileName);
    const tempPath = join(this.storageDir, `${fileName}.${randomUUID()}.tmp`);

    // 1. Path Safety Check
    const pathCheck = ArtifactReferenceValidator.validateStoragePath(targetPath, this.storageDir);
    if (!pathCheck.isValid) {
      throw new Error(pathCheck.reason);
    }

    // 2. Atomic Write: Write to .tmp then rename to target
    writeFileSync(tempPath, buffer);
    renameSync(tempPath, targetPath);

    // 3. Construct and Validate Artifact Entity
    const artifact: Artifact = {
      id,
      type: params.type,
      projectId: params.projectId,
      sessionId: params.sessionId,
      taskId: params.taskId,
      agentId: params.agentId,
      contentUri: `file:///${targetPath.replace(/\\/g, "/")}`,
      sha256,
      sourceEventIds: params.sourceEventIds || [],
      verification: {
        status: "unverified",
        checks: ["initial-write"],
      },
      createdAt: now,
      metadata: {
        sizeBytes: buffer.length,
        originalFilename: params.filename,
        ...params.metadata,
      },
    };

    const validated = Object.freeze(ArtifactSchema.parse(artifact));

    // 4. Save metadata into persistent SQLite repository
    this.repository.save(validated);

    return validated;
  }

  /**
   * Reads an artifact, validates access context, and re-verifies cryptographic integrity.
   * Throws ArtifactIntegrityError if the physical file has been tampered with or corrupted.
   */
  public async readArtifact(
    id: string,
    context?: ArtifactAccessContext
  ): Promise<{ artifact: Artifact; data: Buffer }> {
    const artifact = this.repository.findById(id);
    if (!artifact) {
      throw new ArtifactNotFoundError(`Artifact '${id}' not found in repository.`);
    }

    // 1. Enforce Access & Project Boundaries
    const accessCheck = ArtifactReferenceValidator.validateAccess(artifact, context);
    if (!accessCheck.isValid) {
      throw new ArtifactAccessDeniedError(accessCheck.reason || "Access denied.");
    }

    // 2. Resolve and validate file path
    const filePath = artifact.contentUri.replace(/^file:\/\/\/?/, "");
    if (!existsSync(filePath)) {
      throw new ArtifactNotFoundError(`Physical content for artifact '${id}' is missing at '${filePath}'.`);
    }

    // 3. Read and verify SHA-256 integrity
    const buffer = readFileSync(filePath);
    const actualHash = createHash("sha256").update(buffer).digest("hex");

    if (actualHash !== artifact.sha256) {
      throw new ArtifactIntegrityError(
        `Cryptographic integrity failure for artifact '${id}': expected SHA-256 '${artifact.sha256}', but read '${actualHash}'.`
      );
    }

    return { artifact, data: buffer };
  }

  /**
   * Performs deterministic verification of an artifact and updates its verification status.
   */
  public async verifyArtifact(id: string, verifierId = "system_verifier"): Promise<Artifact> {
    const artifact = this.repository.findById(id);
    if (!artifact) {
      throw new ArtifactNotFoundError(`Artifact '${id}' not found for verification.`);
    }

    const now = new Date().toISOString();
    const checks: string[] = ["schema-valid"];
    let status: ArtifactVerification["status"] = "verified";

    try {
      const filePath = artifact.contentUri.replace(/^file:\/\/\/?/, "");
      if (!existsSync(filePath)) {
        checks.push("file-missing");
        status = "failed";
      } else {
        checks.push("file-exists");
        const buffer = readFileSync(filePath);
        const actualHash = createHash("sha256").update(buffer).digest("hex");
        if (actualHash === artifact.sha256) {
          checks.push("sha256-verified");
        } else {
          checks.push("sha256-mismatch");
          status = "failed";
        }
      }
    } catch {
      checks.push("read-error");
      status = "failed";
    }

    const updatedArtifact: Artifact = {
      ...artifact,
      verification: {
        status,
        checks,
        verifiedAt: now,
        verifierId,
      },
    };

    const validated = Object.freeze(ArtifactSchema.parse(updatedArtifact));
    this.repository.save(validated);

    return validated;
  }

  /**
   * Cleans up dangling temporary files (.tmp) left behind after a crash or interrupted write.
   */
  public async cleanupOrphanTempFiles(): Promise<number> {
    if (!existsSync(this.storageDir)) return 0;

    let cleaned = 0;
    const files = readdirSync(this.storageDir);

    for (const file of files) {
      if (file.endsWith(".tmp")) {
        try {
          unlinkSync(join(this.storageDir, file));
          cleaned++;
        } catch {
          // ignore concurrent deletion
        }
      }
    }

    return cleaned;
  }
}
