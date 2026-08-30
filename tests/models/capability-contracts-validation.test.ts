import { describe, it, expect } from "vitest";
import {
  CapabilityRequirementSchema,
  CapabilityResolutionResultSchema,
  ModelCapabilityProfileSchema,
} from "../../src/domain/capability.js";

describe("Capability Domain Contracts - Schema Validation", () => {
  it("validates valid ModelCapabilityProfileSchema", () => {
    const validProfile = {
      modelId: "test-model",
      inputs: {
        textInput: true,
        imageInput: true,
        audioInput: false,
        videoInput: false,
        documentInput: true,
      },
      outputs: {
        textOutput: true,
        imageOutput: false,
        audioOutput: false,
        videoOutput: false,
      },
      features: {
        toolCalling: true,
        parallelToolCalls: true,
        structuredOutput: true,
        jsonSchema: true,
        streaming: true,
        reasoning: false,
        computerUse: false,
        webSearch: false,
        codeExecution: false,
        promptCaching: true,
      },
      limits: {
        contextWindow: 128000,
        maxOutputTokens: 4096,
      },
      status: "valid" as const,
    };

    const parsed = ModelCapabilityProfileSchema.parse(validProfile);
    expect(parsed.modelId).toBe("test-model");
    expect(parsed.inputs.imageInput).toBe(true);
    expect(parsed.limits.contextWindow).toBe(128000);
  });

  it("validates valid CapabilityRequirementSchema", () => {
    const validReq = {
      requiredInputs: ["text" as const, "image" as const],
      requiredFeatures: ["toolCalling" as const, "streaming" as const],
      minContextTokens: 64000,
      requiredOutputTokens: 2048,
    };

    const parsed = CapabilityRequirementSchema.parse(validReq);
    expect(parsed.requiredInputs?.length).toBe(2);
    expect(parsed.minContextTokens).toBe(64000);
  });

  it("validates CapabilityResolutionResultSchema", () => {
    const validResult = {
      compatible: true,
      status: "COMPATIBLE" as const,
      missingCapabilities: [],
      insufficientLimits: [],
      conflicts: [],
      explanation: "Model satisfies all requirements.",
    };

    const parsed = CapabilityResolutionResultSchema.parse(validResult);
    expect(parsed.compatible).toBe(true);
    expect(parsed.status).toBe("COMPATIBLE");
  });
});
