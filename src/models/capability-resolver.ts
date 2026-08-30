import {
  CapabilityResolutionResultSchema,
  CapabilityRequirementSchema,
  ModelCapabilityProfileSchema,
  type CapabilityRequirement,
  type CapabilityResolutionResult,
  type InsufficientLimit,
  type ModelCapabilityProfile,
} from "../domain/capability.js";
import type { ProviderCapabilities } from "./provider-adapter.js";

export interface CapabilityResolverOptions {
  providerCapabilities?: ProviderCapabilities;
  strictStaleness?: boolean;
}

export class CapabilityResolver {
  /**
   * Deterministically evaluates whether a ModelCapabilityProfile meets requested
   * operational CapabilityRequirements.
   * PRD Part 1 Section 83 & PRD Part 2 Section 41.
   */
  public static resolve(
    profile: ModelCapabilityProfile,
    requirements: CapabilityRequirement,
    options?: CapabilityResolverOptions
  ): CapabilityResolutionResult {
    const validatedProfile = ModelCapabilityProfileSchema.parse(profile);
    const validatedReq = CapabilityRequirementSchema.parse(requirements);

    const missingCapabilities: string[] = [];
    const insufficientLimits: InsufficientLimit[] = [];
    const conflicts: string[] = [];

    // 1. Profile Status Checks
    if (validatedProfile.status === "unknown") {
      return Object.freeze(
        CapabilityResolutionResultSchema.parse({
          compatible: false,
          status: "UNKNOWN",
          missingCapabilities: [],
          insufficientLimits: [],
          conflicts: [],
          explanation: `Model capability profile for '${validatedProfile.modelId}' is unknown or unavailable.`,
        })
      );
    }

    if (validatedProfile.status === "invalid") {
      return Object.freeze(
        CapabilityResolutionResultSchema.parse({
          compatible: false,
          status: "INCOMPATIBLE",
          missingCapabilities: ["valid_profile_metadata"],
          insufficientLimits: [],
          conflicts: [],
          explanation: `Model capability profile for '${validatedProfile.modelId}' is marked invalid.`,
        })
      );
    }

    if (validatedProfile.status === "stale" && options?.strictStaleness) {
      conflicts.push("profile_stale");
    }

    // 2. Input Modalities
    if (validatedReq.requiredInputs) {
      for (const input of validatedReq.requiredInputs) {
        if (input === "text" && !validatedProfile.inputs.textInput) {
          missingCapabilities.push("input:text");
        } else if (input === "image" && !validatedProfile.inputs.imageInput) {
          missingCapabilities.push("input:image");
        } else if (input === "audio" && !validatedProfile.inputs.audioInput) {
          missingCapabilities.push("input:audio");
        } else if (input === "video" && !validatedProfile.inputs.videoInput) {
          missingCapabilities.push("input:video");
        } else if (input === "document" && !validatedProfile.inputs.documentInput) {
          missingCapabilities.push("input:document");
        }
      }
    }

    // 3. Output Modalities
    if (validatedReq.requiredOutputs) {
      for (const output of validatedReq.requiredOutputs) {
        if (output === "text" && !validatedProfile.outputs.textOutput) {
          missingCapabilities.push("output:text");
        } else if (output === "image" && !validatedProfile.outputs.imageOutput) {
          missingCapabilities.push("output:image");
        } else if (output === "audio" && !validatedProfile.outputs.audioOutput) {
          missingCapabilities.push("output:audio");
        } else if (output === "video" && !validatedProfile.outputs.videoOutput) {
          missingCapabilities.push("output:video");
        }
      }
    }

    // 4. Execution Features & Dependencies
    if (validatedReq.requiredFeatures) {
      for (const feature of validatedReq.requiredFeatures) {
        if (!validatedProfile.features[feature]) {
          missingCapabilities.push(`feature:${feature}`);
        }
      }

      // Feature dependencies
      if (
        validatedReq.requiredFeatures.includes("parallelToolCalls") &&
        !validatedProfile.features.toolCalling
      ) {
        conflicts.push("parallelToolCalls_requires_toolCalling");
      }
      if (
        validatedReq.requiredFeatures.includes("jsonSchema") &&
        !validatedProfile.features.structuredOutput
      ) {
        conflicts.push("jsonSchema_requires_structuredOutput");
      }
    }

    // 5. Quantitative Token Limits
    if (validatedReq.minContextTokens) {
      if (validatedReq.minContextTokens > validatedProfile.limits.contextWindow) {
        insufficientLimits.push({
          limit: "contextWindow",
          required: validatedReq.minContextTokens,
          supported: validatedProfile.limits.contextWindow,
        });
      }
    }

    if (validatedReq.requiredOutputTokens) {
      if (validatedReq.requiredOutputTokens > validatedProfile.limits.maxOutputTokens) {
        insufficientLimits.push({
          limit: "maxOutputTokens",
          required: validatedReq.requiredOutputTokens,
          supported: validatedProfile.limits.maxOutputTokens,
        });
      }
    }

    // 6. Provider Adapter Constraints Overlay
    if (options?.providerCapabilities) {
      const pCaps = options.providerCapabilities;
      if (validatedReq.requiredFeatures?.includes("streaming") && !pCaps.supportsStreaming) {
        missingCapabilities.push("provider:streaming");
      }
      if (validatedReq.requiredFeatures?.includes("toolCalling") && !pCaps.supportsTools) {
        missingCapabilities.push("provider:tools");
      }
      if (validatedReq.requiredInputs?.includes("image") && !pCaps.supportsVision) {
        missingCapabilities.push("provider:vision");
      }
      if (validatedReq.requiredInputs?.includes("audio") && !pCaps.supportsAudio) {
        missingCapabilities.push("provider:audio");
      }
    }

    // 7. Synthesize Result Status
    const isCompatible =
      missingCapabilities.length === 0 &&
      insufficientLimits.length === 0 &&
      conflicts.length === 0;

    let status: "COMPATIBLE" | "INCOMPATIBLE" | "UNKNOWN" | "LIMIT_EXCEEDED";
    if (isCompatible) {
      status = "COMPATIBLE";
    } else if (insufficientLimits.length > 0 && missingCapabilities.length === 0 && conflicts.length === 0) {
      status = "LIMIT_EXCEEDED";
    } else {
      status = "INCOMPATIBLE";
    }

    // Build operational explanation
    let explanation: string;
    if (status === "COMPATIBLE") {
      explanation = `Model '${validatedProfile.modelId}' fully satisfies requested capabilities and limits.`;
    } else if (status === "LIMIT_EXCEEDED") {
      const limitDetails = insufficientLimits
        .map((l) => `${l.limit} (required ${l.required} > supported ${l.supported})`)
        .join(", ");
      explanation = `Model '${validatedProfile.modelId}' exceeds token capacity limits: ${limitDetails}.`;
    } else {
      const reasons: string[] = [];
      if (missingCapabilities.length > 0) {
        reasons.push(`missing: [${missingCapabilities.join(", ")}]`);
      }
      if (insufficientLimits.length > 0) {
        reasons.push(`insufficient limits: [${insufficientLimits.map((l) => l.limit).join(", ")}]`);
      }
      if (conflicts.length > 0) {
        reasons.push(`conflicts: [${conflicts.join(", ")}]`);
      }
      explanation = `Model '${validatedProfile.modelId}' incompatible: ${reasons.join("; ")}.`;
    }

    return Object.freeze(
      CapabilityResolutionResultSchema.parse({
        compatible: isCompatible,
        status,
        missingCapabilities,
        insufficientLimits,
        conflicts,
        explanation,
      })
    );
  }
}
