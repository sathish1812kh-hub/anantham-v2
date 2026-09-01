import { describe, it, expect } from "vitest";
import {
  CreateProjectRequestSchema,
  CreateSessionRequestSchema,
  CreateTaskRequestSchema,
  ClaimTaskRequestSchema,
  CreateBackgroundJobRequestSchema,
  QueryEventsRequestSchema,
  ApiErrorResponseSchema,
} from "../../src/domain/api.js";

describe("P8.3 API — Contracts & Schema Validation", () => {
  it("validates CreateProjectRequestSchema", () => {
    const valid = { name: "Anantham Core", trustProfile: "safe" };
    expect(CreateProjectRequestSchema.parse(valid).name).toBe("Anantham Core");

    expect(() => CreateProjectRequestSchema.parse({ name: "" })).toThrow();
  });

  it("validates CreateSessionRequestSchema", () => {
    const valid = { projectId: "proj_01", name: "Dev Session", branch: "feat/tui" };
    expect(CreateSessionRequestSchema.parse(valid).branch).toBe("feat/tui");

    expect(() => CreateSessionRequestSchema.parse({ name: "No Project" })).toThrow();
  });

  it("validates CreateTaskRequestSchema", () => {
    const valid = {
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Build REST API",
      priority: "high",
    };
    expect(CreateTaskRequestSchema.parse(valid).objective).toBe("Build REST API");
  });

  it("validates ClaimTaskRequestSchema", () => {
    const valid = {
      agentId: "agent_operator",
      instanceId: "inst_01",
      leaseTtlMs: 30000,
    };
    expect(ClaimTaskRequestSchema.parse(valid).leaseTtlMs).toBe(30000);
  });

  it("validates QueryEventsRequestSchema with defaults", () => {
    const parsed = QueryEventsRequestSchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(0);
  });

  it("validates ApiErrorResponseSchema", () => {
    const err = {
      success: false,
      error: {
        code: "forbidden",
        message: "Project boundary violation",
        classification: "FORBIDDEN",
      },
    };
    expect(ApiErrorResponseSchema.parse(err).error.classification).toBe("FORBIDDEN");
  });
});
