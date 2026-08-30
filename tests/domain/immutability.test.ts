import { describe, it, expect } from "vitest";
import { freezeEvent, isEventFrozen, type HarnessEvent } from "../../src/domain/event.js";
import { freezeCheckpoint, type Checkpoint } from "../../src/domain/checkpoint.js";

describe("Domain Immutability Invariants", () => {
  it("enforces deep immutability on HarnessEvent", () => {
    const event: HarnessEvent = {
      id: "evt_001",
      schemaVersion: 1,
      projectId: "proj_01",
      type: "session.created",
      actor: "user",
      timestamp: "2026-08-30T20:00:00.000Z",
      payload: {
        meta: {
          initiator: "alice",
          nested: { count: 1 },
        },
      },
    };

    const frozen = freezeEvent(event);
    expect(isEventFrozen(frozen)).toBe(true);

    // Attempting to mutate top-level property throws in strict mode
    expect(() => {
      // @ts-expect-error - testing runtime mutation rejection
      frozen.type = "session.tampered";
    }).toThrow();

    // Attempting to mutate nested payload property throws
    expect(() => {
      // @ts-expect-error - testing runtime mutation rejection
      (frozen.payload as Record<string, unknown>).meta = { hacked: true };
    }).toThrow();

    // Attempting to mutate deeply nested payload throws
    expect(() => {
      // @ts-expect-error - testing runtime mutation rejection
      ((frozen.payload as Record<string, unknown>).meta as Record<string, unknown>).nested = { count: 2 };
    }).toThrow();
  });

  it("enforces deep immutability on Checkpoint", () => {
    const sampleSha = "e".repeat(64);
    const checkpoint: Checkpoint = {
      id: "chk_001",
      type: "manual",
      projectId: "proj_01",
      sessionId: "sess_01",
      manifest: {
        schemaVersion: 1,
        eventOffset: 10,
        branch: "main",
        taskStateSummary: { t1: "completed" },
        artifactHashes: { a1: sampleSha },
      },
      sha256: sampleSha,
      createdAt: "2026-08-30T20:00:00.000Z",
      validationChecksum: "chk_valid",
    };

    const frozen = freezeCheckpoint(checkpoint);

    expect(() => {
      // @ts-expect-error - testing runtime mutation rejection
      frozen.type = "pre-edit";
    }).toThrow();

    expect(() => {
      // @ts-expect-error - testing runtime mutation rejection
      frozen.manifest.eventOffset = 999;
    }).toThrow();

    expect(() => {
      // @ts-expect-error - testing runtime mutation rejection
      frozen.manifest.taskStateSummary.t1 = "failed";
    }).toThrow();
  });
});
