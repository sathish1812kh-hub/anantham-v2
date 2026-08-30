import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";
import { SecurityMetadataSchema } from "./security.js";

/**
 * Universal content kinds supported by Anantham.
 * PRD Part 1 Section 10 (PRD-DATA-001).
 */
export const ContentKindSchema = z.enum([
  "text",
  "code",
  "image",
  "document",
  "table",
  "audio",
  "video",
  "archive",
  "binary",
  "artifact",
  "web",
  "mcp-resource",
]);
export type ContentKind = z.infer<typeof ContentKindSchema>;

/**
 * Content representation types extracted from universal content.
 * PRD Part 1 Section 11.1.
 */
export const ContentRepresentationTypeSchema = z.enum([
  "raw",
  "text",
  "markdown",
  "json",
  "csv",
  "table",
  "image",
  "audio",
  "video",
  "transcript",
  "frames",
  "metadata",
  "ocr",
  "code-ast",
  "symbol-map",
  "document-pages",
  "archive-index",
  "browser-dom",
  "browser-accessibility-tree",
]);
export type ContentRepresentationType = z.infer<typeof ContentRepresentationTypeSchema>;

/**
 * Content representation object.
 */
export const ContentRepresentationSchema = z.object({
  id: z.string().min(1),
  type: ContentRepresentationTypeSchema,
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  uri: z.string().optional(),
  data: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ContentRepresentation = z.infer<typeof ContentRepresentationSchema>;

/**
 * Origin source descriptor for content objects.
 */
export const ContentSourceSchema = z.object({
  type: z.enum([
    "upload",
    "filesystem",
    "tool",
    "mcp",
    "browser",
    "generated",
    "clipboard",
  ]),
  uri: z.string().optional(),
});
export type ContentSource = z.infer<typeof ContentSourceSchema>;

/**
 * Universal ContentObject contract.
 * PRD Part 1 Section 10 (PRD-DATA-001).
 */
export const ContentObjectSchema = z.object({
  id: z.string().min(1),
  kind: ContentKindSchema,
  mimeType: z.string().min(1),
  name: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  source: ContentSourceSchema,
  representations: z.array(ContentRepresentationSchema),
  provenance: ProvenanceSchema,
  security: SecurityMetadataSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type ContentObject = z.infer<typeof ContentObjectSchema>;
