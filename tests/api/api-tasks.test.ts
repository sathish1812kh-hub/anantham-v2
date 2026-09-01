import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApiServer } from "../../src/api/api-server.js";
import { AnanthamClient } from "../../src/sdk/anantham-client.js";

describe("P8.3 API — Tasks & Lease Claims Endpoints", () => {
  let server: ApiServer;
  let client: AnanthamClient;

  beforeEach(async () => {
    server = new ApiServer({ dbPath: ":memory:" });
    const info = await server.listen(0);
    client = new AnanthamClient({ baseUrl: info.url });
  });

  afterEach(async () => {
    await server.close();
  });

  it("creates, lists, and claims tasks via REST API", async () => {
    const project = await client.projects.create({ name: "Task App" });
    const session = await client.sessions.create({ projectId: project.id, name: "Task Session" });

    // 1. Create Task
    const task = await client.tasks.create({
      projectId: project.id,
      sessionId: session.id,
      objective: "Execute parallel task over REST",
      priority: "high",
    });

    expect(task.id).toMatch(/^task_/);
    expect(task.status).toBe("available");

    // 2. List Tasks
    const list = await client.tasks.list(session.id);
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(task.id);

    // 3. Claim Task
    const lease = await client.tasks.claim(task.id, {
      agentId: "agent_runner_1",
      instanceId: "inst_runner_1",
      leaseTtlMs: 20000,
    });

    expect(lease.taskId).toBe(task.id);
    expect(lease.agentId).toBe("agent_runner_1");
    expect(lease.generation).toBe(1);
  });
});
