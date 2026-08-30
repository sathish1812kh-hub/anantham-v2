import { createHash } from "node:crypto";
import { type Checkpoint } from "../domain/checkpoint.js";
import { CheckpointManifestBuilder } from "./checkpoint-manifest.js";
import type { ArtifactRepository } from "../persistence/repositories/artifact-repository.js";
import type { EventRepository } from "../persistence/repositories/event-repository.js";

export interface CheckpointValidationResult {
  isValid: boolean;
  manifestSha256Valid: boolean;
  checksumValid: boolean;
  artifactsValid: boolean;
  missingArtifactIds: string[];
  mismatchedArtifactIds: string[];
  eventOffsetValid: boolean;
  errors: string[];
}

export class CheckpointValidator {
  /**
   * Validates the internal cryptographic integrity of a Checkpoint.
   */
  public static validateIntegrity(checkpoint: Checkpoint): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. Check SHA-256 of manifest
    const expectedSha256 = CheckpointManifestBuilder.computeManifestSha256(checkpoint.manifest);
    if (checkpoint.sha256 !== expectedSha256) {
      errors.push(
        `Manifest SHA-256 mismatch: recorded ${checkpoint.sha256}, calculated ${expectedSha256}`
      );
    }

    // 2. Check validationChecksum
    const expectedChecksum = createHash("sha256")
      .update(
        `${checkpoint.id}:${checkpoint.type}:${checkpoint.sessionId}:${checkpoint.createdAt}:${checkpoint.sha256}`,
        "utf8"
      )
      .digest("hex");

    if (checkpoint.validationChecksum !== expectedChecksum) {
      errors.push(
        `Validation checksum mismatch: recorded ${checkpoint.validationChecksum}, calculated ${expectedChecksum}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Performs full structural and persistent validation against database repositories.
   */
  public static async validateComplete(
    checkpoint: Checkpoint,
    repositories?: {
      artifactRepo?: ArtifactRepository;
      eventRepo?: EventRepository;
    }
  ): Promise<CheckpointValidationResult> {
    const integrity = CheckpointValidator.validateIntegrity(checkpoint);
    const errors: string[] = [...integrity.errors];

    let artifactsValid = true;
    const missingArtifactIds: string[] = [];
    const mismatchedArtifactIds: string[] = [];

    // Validate referenced artifacts if artifactRepo is provided
    if (repositories?.artifactRepo && checkpoint.manifest.artifactHashes) {
      for (const [artifactId, expectedHash] of Object.entries(checkpoint.manifest.artifactHashes)) {
        const artifact = repositories.artifactRepo.findById(artifactId);
        if (!artifact) {
          missingArtifactIds.push(artifactId);
          artifactsValid = false;
          errors.push(`Referenced artifact '${artifactId}' not found in database.`);
        } else if (artifact.sha256 !== expectedHash) {
          mismatchedArtifactIds.push(artifactId);
          artifactsValid = false;
          errors.push(
            `Artifact '${artifactId}' hash mismatch: manifest recorded ${expectedHash}, database has ${artifact.sha256}.`
          );
        }
      }
    }

    // Validate event offset if eventRepo is provided
    let eventOffsetValid = true;
    if (repositories?.eventRepo) {
      const eventCount = repositories.eventRepo.countBySession(checkpoint.sessionId);
      if (checkpoint.manifest.eventOffset > eventCount) {
        eventOffsetValid = false;
        errors.push(
          `Checkpoint event offset ${checkpoint.manifest.eventOffset} exceeds session event count ${eventCount}.`
        );
      }
    }

    const isValid = integrity.isValid && artifactsValid && eventOffsetValid;

    return {
      isValid,
      manifestSha256Valid: !integrity.errors.some((e) => e.includes("Manifest SHA-256")),
      checksumValid: !integrity.errors.some((e) => e.includes("Validation checksum")),
      artifactsValid,
      missingArtifactIds,
      mismatchedArtifactIds,
      eventOffsetValid,
      errors,
    };
  }
}
