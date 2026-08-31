import { describe, it, expect } from "vitest";
import {
  BackgroundJobSchema,
  JobCreationRequestSchema,
  JobStatusSchema,
  JobFailureClassificationSchema,
  type BackgroundJob,
} from "../../src/domain/job.js";

describe("P7.3 Background Job — Contracts & Validation", () => {
  it("validates valid background job domain contract and populates default values", () => {
    const rawJob = {
      id: "job_01",
      projectId: "proj_01",
      sessionId: "sess_01",
      taskId: "task_01",
      agentId: "agent_dev",
      instanceId: "inst_01",
      createdAt: new Date().toISOString(),
    };

    const parsed = BackgroundJobSchema.parse(rawJob);
    expect(parsed.status).toBe("CREATED");
    expect(parsed.attempt).toBe(0);
    expect(parsed.maxAttempts).toBe(3);
    expect(parsed.consumption.tokens).toBe(0);
    expect(parsed.consumption.costUsd).toBe(0);
    expect(parsed.resultArtifacts).toEqual([]);
  });

  it("validates all 13 job lifecycle statuses", () => {
    const statuses = [
      "CREATED",
      "QUEUED",
      "CLAIMING",
      "RUNNING",
      "PAUSED",
      "CANCEL_REQUESTED",
      "CANCELLED",
      "COMPLETING",
      "COMPLETED",
      "FAILED",
      "TIMED_OUT",
      "ORPHANED",
      "RECOVERY_REQUIRED",
    ];

    for (const st of statuses) {
      expect(JobStatusSchema.parse(st)).toBe(st);
    }
  });

  it("validates failure classifications", () => {
    const classifications = [
      "POLICY_DENIAL",
      "PERMISSION_DENIED",
      "INVALID_SCHEMA",
      "PERMANENT_CAPABILITY_FAILURE",
      "RATE_LIMIT",
      "TIMEOUT",
      "NETWORK_ERROR",
      "TRANSIENT_TOOL_ERROR",
      "UNKNOWN",
    ];

    for (const fc of classifications) {
      expect(JobFailureClassificationSchema.parse(fc)).toBe(fc);
    }
  });

  it("validates JobCreationRequestSchema", () => {
    const req = {
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Train background neural network model",
      agentId: "agent_ml",
      timeoutMs: 60000,
      maxAttempts: 5,
    };

    const parsed = JobCreationRequestSchema.parse(req);
    expect(parsed.objective).toBe("Train background neural network model");
    expect(parsed.timeoutMs).toBe(60000);
    expect(parsed.maxAttempts).toBe(5);
  });
});
