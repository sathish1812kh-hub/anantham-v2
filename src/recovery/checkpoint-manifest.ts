import { createHash } from "node:crypto";
import {
  CheckpointSchema,
  freezeCheckpoint,
  type Checkpoint,
  type CheckpointManifest,
  type CheckpointType,
} from "../domain/checkpoint.js";

export interface CreateCheckpointOptions {
  id?: string;
  projectId: string;
  sessionId: string;
  type: CheckpointType;
  eventOffset: number;
  branch?: string;
  taskStateSummary?: Record<string, string>;
  memorySummary?: string;
  contextSummary?: string;
  artifactHashes?: Record<string, string>;
  workspaceStateHash?: string;
  providerStateSummary?: string;
  createdAt?: string;
}

export class CheckpointManifestBuilder {
  /**
   * Computes the deterministic SHA-256 digest of a checkpoint manifest.
   */
  public static computeManifestSha256(manifest: CheckpointManifest): string {
    // Sort keys deterministically for canonical JSON
    const canonicalString = JSON.stringify(manifest, Object.keys(manifest).sort());
    return createHash("sha256").update(canonicalString, "utf8").digest("hex");
  }

  /**
   * Creates and cryptographically signs a Checkpoint instance.
   */
  public static createCheckpoint(options: CreateCheckpointOptions): Readonly<Checkpoint> {
    const manifest: CheckpointManifest = {
      schemaVersion: 1,
      eventOffset: options.eventOffset,
      branch: options.branch ?? "main",
      taskStateSummary: options.taskStateSummary ?? {},
      memorySummary: options.memorySummary,
      contextSummary: options.contextSummary,
      artifactHashes: options.artifactHashes ?? {},
      workspaceStateHash: options.workspaceStateHash,
      providerStateSummary: options.providerStateSummary,
    };

    const sha256 = CheckpointManifestBuilder.computeManifestSha256(manifest);
    const createdAt = options.createdAt ?? new Date().toISOString();
    const id = options.id ?? `chk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // validationChecksum binds id, type, sessionId, createdAt, and sha256
    const validationChecksum = createHash("sha256")
      .update(`${id}:${options.type}:${options.sessionId}:${createdAt}:${sha256}`, "utf8")
      .digest("hex");

    const checkpoint: Checkpoint = {
      id,
      type: options.type,
      projectId: options.projectId,
      sessionId: options.sessionId,
      manifest,
      sha256,
      createdAt,
      validationChecksum,
    };

    const validated = CheckpointSchema.parse(checkpoint);
    return freezeCheckpoint(validated);
  }
}
