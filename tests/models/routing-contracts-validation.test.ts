import { describe, it, expect } from "vitest";
import {
  ModelCandidateSchema,
  RoutingRequestSchema,
  RoutingDecisionSchema,
  ExecutionAttemptRecordSchema,
} from "../../src/domain/routing.js";
import { GPT_4O_PROFILE } from "../../src/models/capability-profiles.js";

describe("Routing Domain Contracts - Schema Validation", () => {
  it("validates ModelCandidateSchema", () => {
    const candidate = {
      modelId: "gpt-4o",
      providerId: "openai",
      profile: GPT_4O_PROFILE,
      priority: 10,
      maxSensitivity: "secret" as const,
    };

    const parsed = ModelCandidateSchema.parse(candidate);
    expect(parsed.modelId).toBe("gpt-4o");
    expect(parsed.priority).toBe(10);
  });

  it("validates RoutingRequestSchema with default attempts and sensitivity", () => {
    const request = {
      requirements: {
        requiredInputs: ["text" as const, "image" as const],
      },
      preferredModelId: "gpt-4o",
    };

    const parsed = RoutingRequestSchema.parse(request);
    expect(parsed.maxAttempts).toBe(3);
    expect(parsed.sensitivity).toBe("normal");
  });

  it("validates ExecutionAttemptRecordSchema", () => {
    const record = {
      attemptNumber: 1,
      modelId: "gpt-4o",
      providerId: "openai",
      status: "failure" as const,
      errorName: "RateLimitError",
      errorMessage: "429 Too Many Requests",
      durationMs: 150,
      timestamp: new Date().toISOString(),
    };

    const parsed = ExecutionAttemptRecordSchema.parse(record);
    expect(parsed.status).toBe("failure");
    expect(parsed.errorName).toBe("RateLimitError");
  });

  it("validates RoutingDecisionSchema", () => {
    const candidate = {
      modelId: "gpt-4o",
      providerId: "openai",
      profile: GPT_4O_PROFILE,
      priority: 10,
      maxSensitivity: "secret" as const,
    };

    const decision = {
      selectedCandidate: candidate,
      rankedCandidates: [candidate],
      rejectedCandidates: [],
      explanation: "Selected primary candidate.",
    };

    const parsed = RoutingDecisionSchema.parse(decision);
    expect(parsed.selectedCandidate.modelId).toBe("gpt-4o");
    expect(parsed.rankedCandidates.length).toBe(1);
  });
});
