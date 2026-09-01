import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApiServer } from "../../src/api/api-server.js";
import { AnanthamClient } from "../../src/sdk/anantham-client.js";

describe("P8.3 API — Background Jobs Resource Endpoints", () => {
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

  it("creates and lists background jobs via REST API", async () => {
    const project = await client.projects.create({ name: "Job App" });
    const session = await client.sessions.create({ projectId: project.id, name: "Job Session" });
    const task = await client.tasks.create({
      projectId: project.id,
      sessionId: session.id,
      objective: "Background work",
    });

    const job = await client.jobs.create({
      projectId: project.id,
      sessionId: session.id,
      taskId: task.id,
      agentId: "agent_worker_1",
      payload: { mode: "async" },
    });

    expect(job.id).toMatch(/^job_/);
    expect(job.status).toBe("QUEUED");

    const list = await client.jobs.list(project.id);
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(job.id);
  });
});
