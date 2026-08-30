import { describe, it, expect } from "vitest";
import {
  TaskSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  isValidTaskTransition,
  assertValidTaskTransition,
  type Task,
} from "../../src/domain/task.js";

describe("Task Domain Contracts and State Machine", () => {
  it("validates a Task specification", () => {
    const task: Task = {
      id: "task_01",
      projectId: "proj_01",
      sessionId: "sess_01",
      objective: "Define and test P1.1 domain contracts",
      status: "running",
      priority: "critical",
      agentRole: "core-engineer",
      modelProfile: "claude-3-5-sonnet",
      keyPoolProfile: "default-pool",
      permissionProfile: "developer",
      dependencies: [],
      inputArtifacts: ["art_plan_01"],
      outputArtifacts: [],
      readSet: ["src/domain/"],
      writeSet: ["src/domain/"],
      createdAt: "2026-08-30T20:00:00.000Z",
      updatedAt: "2026-08-30T20:10:00.000Z",
    };

    const parsed = TaskSchema.parse(task);
    expect(parsed).toEqual(task);
  });

  it("validates all 10 task statuses", () => {
    const statuses = [
      "queued",
      "claimed",
      "running",
      "waiting_approval",
      "blocked",
      "paused",
      "verifying",
      "completed",
      "failed",
      "cancelled",
    ];

    for (const s of statuses) {
      expect(TaskStatusSchema.parse(s)).toBe(s);
    }
  });

  it("validates all 4 task priorities", () => {
    const priorities = ["critical", "high", "normal", "low"];
    for (const p of priorities) {
      expect(TaskPrioritySchema.parse(p)).toBe(p);
    }
  });

  describe("State Machine Invariants (PRD Part 1 Section 101)", () => {
    it("allows valid transitions", () => {
      expect(isValidTaskTransition("queued", "claimed")).toBe(true);
      expect(isValidTaskTransition("claimed", "running")).toBe(true);
      expect(isValidTaskTransition("running", "verifying")).toBe(true);
      expect(isValidTaskTransition("verifying", "completed")).toBe(true);
      expect(isValidTaskTransition("verifying", "failed")).toBe(true);
      expect(isValidTaskTransition("running", "waiting_approval")).toBe(true);
      expect(isValidTaskTransition("waiting_approval", "running")).toBe(true);
      expect(isValidTaskTransition("running", "paused")).toBe(true);
      expect(isValidTaskTransition("paused", "running")).toBe(true);
      expect(isValidTaskTransition("failed", "queued")).toBe(true);
    });

    it("rejects invalid state transitions", () => {
      // Completed is terminal
      expect(isValidTaskTransition("completed", "running")).toBe(false);
      expect(isValidTaskTransition("completed", "queued")).toBe(false);

      // Cancelled is terminal
      expect(isValidTaskTransition("cancelled", "running")).toBe(false);

      // Cannot jump from queued directly to completed
      expect(isValidTaskTransition("queued", "completed")).toBe(false);
    });

    it("assertValidTaskTransition throws on invalid transition", () => {
      expect(() => assertValidTaskTransition("completed", "running")).toThrow(
        /Invalid task state transition/
      );
    });
  });
});
