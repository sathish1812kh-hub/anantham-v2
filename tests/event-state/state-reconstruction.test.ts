import { describe, it, expect } from "vitest";
import { reconstructSessionState } from "../../src/event-state/reconstruction/session-reconstruct.js";
import { reconstructTaskState } from "../../src/event-state/reconstruction/task-reconstruct.js";
import { EventTypes, type HarnessEvent } from "../../src/domain/event.js";

describe("Deterministic State Reconstruction", () => {
  it("reconstructs session aggregate from event stream", () => {
    const events: Readonly<HarnessEvent>[] = [
      {
        id: "e1",
        schemaVersion: 1,
        projectId: "proj_01",
        sessionId: "sess_01",
        type: EventTypes.SESSION_CREATED,
        actor: "user",
        timestamp: "2026-08-30T20:00:00.000Z",
        payload: { name: "Main Workflow", branch: "main" },
      },
      {
        id: "e2",
        schemaVersion: 1,
        projectId: "proj_01",
        sessionId: "sess_01",
        taskId: "t1",
        type: EventTypes.TASK_CREATED,
        actor: "agent",
        timestamp: "2026-08-30T20:00:01.000Z",
        payload: { objective: "Task 1" },
      },
      {
        id: "e3",
        schemaVersion: 1,
        projectId: "proj_01",
        sessionId: "sess_01",
        taskId: "t1",
        type: EventTypes.TASK_STARTED,
        actor: "agent",
        timestamp: "2026-08-30T20:00:02.000Z",
        payload: {},
      },
      {
        id: "e4",
        schemaVersion: 1,
        projectId: "proj_01",
        sessionId: "sess_01",
        taskId: "t1",
        type: EventTypes.TASK_COMPLETED,
        actor: "agent",
        timestamp: "2026-08-30T20:00:03.000Z",
        payload: {},
      },
      {
        id: "e5",
        schemaVersion: 1,
        projectId: "proj_01",
        sessionId: "sess_01",
        type: EventTypes.SESSION_COMPLETED,
        actor: "system",
        timestamp: "2026-08-30T20:00:04.000Z",
        payload: {},
      },
    ];

    const state = reconstructSessionState("sess_01", events);
    expect(state.status).toBe("completed");
    expect(state.name).toBe("Main Workflow");
    expect(state.branch).toBe("main");
    expect(state.tasksCount).toBe(1);
    expect(state.completedTasksCount).toBe(1);
    expect(state.failedTasksCount).toBe(0);
    expect(state.eventCount).toBe(5);
    expect(state.activeTaskId).toBeUndefined();
  });

  it("reconstructs task aggregate with steering and failure history", () => {
    const events: Readonly<HarnessEvent>[] = [
      {
        id: "e1",
        schemaVersion: 1,
        projectId: "proj_01",
        sessionId: "sess_01",
        taskId: "task_01",
        type: EventTypes.TASK_CREATED,
        actor: "agent",
        timestamp: "2026-08-30T20:00:00.000Z",
        payload: { objective: "Deploy API", priority: "high" },
      },
      {
        id: "e2",
        schemaVersion: 1,
        projectId: "proj_01",
        sessionId: "sess_01",
        taskId: "task_01",
        type: EventTypes.TASK_STARTED,
        actor: "agent",
        agentId: "agent_dev",
        timestamp: "2026-08-30T20:00:01.000Z",
        payload: {},
      },
      {
        id: "e3",
        schemaVersion: 1,
        projectId: "proj_01",
        sessionId: "sess_01",
        taskId: "task_01",
        type: EventTypes.TASK_STEERED,
        actor: "user",
        timestamp: "2026-08-30T20:00:02.000Z",
        payload: { instruction: "Use staging environment first" },
      },
      {
        id: "e4",
        schemaVersion: 1,
        projectId: "proj_01",
        sessionId: "sess_01",
        taskId: "task_01",
        type: EventTypes.TASK_FAILED,
        actor: "agent",
        timestamp: "2026-08-30T20:00:03.000Z",
        payload: { error: "Staging host unreachable" },
      },
    ];

    const state = reconstructTaskState("task_01", events);
    expect(state.status).toBe("failed");
    expect(state.objective).toBe("Deploy API");
    expect(state.priority).toBe("high");
    expect(state.assignedAgent).toBe("agent_dev");
    expect(state.failureReason).toBe("Staging host unreachable");
    expect(state.steeringHistory).toHaveLength(1);
    expect(state.steeringHistory[0]?.instruction).toBe("Use staging environment first");
  });
});
