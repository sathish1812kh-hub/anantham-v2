import { z } from "zod";
import type { ContentObject, ContentRepresentation } from "../domain/content.js";
import { ContentGuards } from "./content-guards.js";

export const ModelModalitySchema = z.enum(["text", "image", "audio", "video"]);
export type ModelModality = z.infer<typeof ModelModalitySchema>;

export const ModelModalityProfileSchema = z.object({
  modelId: z.string().min(1),
  supportedModalities: z.array(ModelModalitySchema).min(1),
  maxTokensPerItem: z.number().int().positive().optional(),
  preferMarkdown: z.boolean().optional(),
});
export type ModelModalityProfile = z.infer<typeof ModelModalityProfileSchema>;

export interface SelectionResult {
  representation: ContentRepresentation;
  isNativeModality: boolean;
  wasTruncated: boolean;
  estimatedTokens: number;
}

export class RepresentationSelector {
  /**
   * Deterministically selects the optimal ContentRepresentation from a ContentObject
   * based on the model modality profile and token constraints.
   * PRD Part 1 Section 11 & PRD Part 2 Section 50.
   */
  public static selectOptimalRepresentation(
    content: ContentObject,
    profile: ModelModalityProfile
  ): SelectionResult {
    const supportsVision = profile.supportedModalities.includes("image");
    const supportsAudio = profile.supportedModalities.includes("audio");
    const supportsVideo = profile.supportedModalities.includes("video");

    let candidate: ContentRepresentation | undefined;
    let isNativeModality = false;

    // 1. Check Native Modalities
    if (content.kind === "image" && supportsVision) {
      candidate = content.representations.find((r) => r.type === "image");
      if (candidate) isNativeModality = true;
    } else if (content.kind === "audio" && supportsAudio) {
      candidate = content.representations.find((r) => r.type === "audio");
      if (candidate) isNativeModality = true;
    } else if (content.kind === "video" && supportsVideo) {
      candidate = content.representations.find((r) => r.type === "video");
      if (candidate) isNativeModality = true;
    }

    // 2. Structured & Code Preferences
    if (!candidate) {
      if (profile.preferMarkdown) {
        candidate = content.representations.find((r) => r.type === "markdown");
      }
      if (!candidate && (content.kind === "table" || content.kind === "code" || content.kind === "text")) {
        candidate =
          content.representations.find((r) => r.type === "table") ||
          content.representations.find((r) => r.type === "json") ||
          content.representations.find((r) => r.type === "markdown") ||
          content.representations.find((r) => r.type === "text");
        if (candidate) isNativeModality = true;
      }
    }

    // 3. Fallback: Text, Document Pages, or Metadata
    if (!candidate) {
      candidate =
        content.representations.find((r) => r.type === "text") ||
        content.representations.find((r) => r.type === "document-pages") ||
        content.representations.find((r) => r.type === "archive-index") ||
        content.representations.find((r) => r.type === "metadata") ||
        content.representations[0];
      isNativeModality = false;
    }

    if (!candidate) {
      throw new Error(`ContentObject ${content.id} contains no representations.`);
    }

    // 4. Token Budget Guarding
    let finalRepresentation = candidate;
    let wasTruncated = false;
    let estimatedTokens = 0;

    if (candidate.data && typeof candidate.data === "string") {
      estimatedTokens = ContentGuards.estimateTokens(candidate.data);
      if (profile.maxTokensPerItem && estimatedTokens > profile.maxTokensPerItem) {
        const maxChars = profile.maxTokensPerItem * 4;
        const truncatedData = candidate.data.slice(0, maxChars) + "\n... [TRUNCATED DUE TO TOKEN BUDGET]";
        finalRepresentation = {
          ...candidate,
          data: truncatedData,
          sizeBytes: Buffer.byteLength(truncatedData, "utf8"),
        };
        wasTruncated = true;
        estimatedTokens = profile.maxTokensPerItem;
      }
    }

    return {
      representation: finalRepresentation,
      isNativeModality,
      wasTruncated,
      estimatedTokens,
    };
  }
}
