import { describe, it, expect } from "vitest";
import {
  HarnessEventSchema,
  ActorTypeSchema,
  EventTypes,
  type HarnessEvent,
} from "../../src/domain/event.js";

describe("HarnessEvent Domain Contracts", () => {
  it("validates valid HarnessEvents from diverse actors", () => {
    const userEvent: HarnessEvent = {
      id: "evt_001",
      schemaVersion: 1,
      projectId: "proj_01",
      sessionId: "sess_01",
      taskId: "task_01",
      type: EventTypes.TASK_CREATED,
      actor: "user",
      timestamp: "2026-08-30T20:00:00.000Z",
      payload: {
        objective: "Initialize repo and domain models",
        priority: "critical",
      },
      correlationId: "corr_001",
    };

    const parsed = HarnessEventSchema.parse(userEvent);
    expect(parsed).toEqual(userEvent);
  });

  it("validates all PRD actor types", () => {
    const actors = ["user", "agent", "system", "tool", "mcp", "verifier"];
    for (const a of actors) {
      expect(ActorTypeSchema.parse(a)).toBe(a);
    }
  });

  it("rejects non-positive schemaVersion", () => {
    expect(() =>
      HarnessEventSchema.parse({
        id: "evt_002",
        schemaVersion: 0,
        type: EventTypes.SESSION_CREATED,
        actor: "system",
        timestamp: "2026-08-30T20:00:00.000Z",
        payload: {},
      })
    ).toThrow();
  });
});
