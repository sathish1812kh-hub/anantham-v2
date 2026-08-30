import { createHash } from "node:crypto";
import type { ContentObject } from "../domain/content.js";
import type { Provenance } from "../domain/provenance.js";
import { ProvenanceSchema } from "../domain/provenance.js";

export interface ProvenanceValidationResult {
  isValid: boolean;
  violations: string[];
}

export class ProvenanceManager {
  /**
   * Creates derived provenance linking a transformed ContentObject to its parent.
   * PRD Part 1 Section 14 & PRD Part 3 Section 137.
   */
  public static createDerivedProvenance(
    parent: ContentObject,
    transformation: string,
    actor?: string
  ): Provenance {
    const now = new Date().toISOString();
    const parentIds = [...(parent.provenance.parentIds || []), parent.id];

    const provenance: Provenance = {
      sourceType: "derived",
      sourceId: actor || parent.provenance.sourceId,
      sourceUri: parent.provenance.sourceUri,
      parentIds,
      capturedAt: now,
      extractor: {
        name: "anantham-provenance-manager",
        version: "2.0.0",
      },
      transformations: [...(parent.provenance.transformations || []), transformation],
    };

    return Object.freeze(ProvenanceSchema.parse(provenance));
  }

  /**
   * Verifies the cryptographic integrity of raw data against the recorded ContentObject SHA-256 hash.
   */
  public static verifyIntegrity(content: ContentObject, data: Buffer | string): boolean {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    const computedHash = createHash("sha256").update(buffer).digest("hex");
    return computedHash === content.sha256;
  }

  /**
   * Verifies that the provenance parent chain and lineage are consistent.
   */
  public static verifyLineage(
    content: ContentObject,
    ancestorMap?: Map<string, ContentObject>
  ): ProvenanceValidationResult {
    const violations: string[] = [];

    if (!content.provenance) {
      violations.push(`ContentObject '${content.id}' is missing required provenance metadata.`);
      return { isValid: false, violations };
    }

    if (!content.provenance.capturedAt) {
      violations.push(`ContentObject '${content.id}' is missing capturedAt timestamp.`);
    }

    // Verify parent relationships if ancestorMap is provided
    if (ancestorMap && content.provenance.parentIds) {
      for (const parentId of content.provenance.parentIds) {
        if (!ancestorMap.has(parentId)) {
          violations.push(`Unresolved parent reference '${parentId}' in lineage for '${content.id}'.`);
        }
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }
}
