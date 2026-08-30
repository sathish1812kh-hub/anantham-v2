import { z } from "zod";

/**
 * Checkpoint trigger types.
 * PRD Part 1 Section 42.
 */
export const CheckpointTypeSchema = z.enum([
  "automatic",
  "manual",
  "pre-compaction",
  "pre-edit",
  "pre-risk",
  "pre-merge",
  "post-verification",
  "task-completion",
  "shutdown",
]);
export type CheckpointType = z.infer<typeof CheckpointTypeSchema>;

/**
 * Checkpoint manifest recording durable state offsets and checksums.
 * PRD Part 1 Section 41 & 47.
 */
export const CheckpointManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  eventOffset: z.number().int().nonnegative(),
  branch: z.string().min(1),
  taskStateSummary: z.record(z.string()),
  memorySummary: z.string().optional(),
  contextSummary: z.string().optional(),
  artifactHashes: z.record(z.string()),
  workspaceStateHash: z.string().optional(),
  providerStateSummary: z.string().optional(),
});
export type CheckpointManifest = z.infer<typeof CheckpointManifestSchema>;

/**
 * Durable Checkpoint contract.
 * PRD Part 1 Section 41.
 */
export const CheckpointSchema = z.object({
  id: z.string().min(1),
  type: CheckpointTypeSchema,
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  manifest: CheckpointManifestSchema,
  sha256: z.string().length(64),
  createdAt: z.string().min(1),
  validationChecksum: z.string().min(1),
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

/**
 * Deep freezes a Checkpoint to prevent modification.
 */
export function freezeCheckpoint<T extends Checkpoint>(checkpoint: T): Readonly<T> {
  const deepFreeze = (obj: unknown): unknown => {
    if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) {
      return obj;
    }
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      const val = (obj as Record<string, unknown>)[key];
      if (val !== null && typeof val === "object") {
        deepFreeze(val);
      }
    }
    return obj;
  };

  return deepFreeze(structuredClone(checkpoint)) as Readonly<T>;
}
