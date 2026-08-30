import { z } from "zod";

/**
 * Extractor metadata identifying the component that parsed/extracted content.
 */
export const ExtractorMetadataSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});
export type ExtractorMetadata = z.infer<typeof ExtractorMetadataSchema>;

/**
 * Universal Provenance model tracking origins, parentage, and extraction lineage.
 * PRD Part 1 Section 117 (PRD-DATA-001 / PRD-PROV-001).
 */
export const ProvenanceSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().optional(),
  sourceUri: z.string().optional(),
  parentIds: z.array(z.string()),
  capturedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
  extractor: ExtractorMetadataSchema.optional(),
  transformations: z.array(z.string()),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;
