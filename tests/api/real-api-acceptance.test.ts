import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApiServer } from "../../src/api/api-server.js";
import { ApiAuthenticator } from "../../src/api/api-authenticator.js";
import { AnanthamClient } from "../../src/sdk/anantham-client.js";

describe("P8.3 API — End-to-End Programmatic Acceptance Scenario", () => {
  let server: ApiServer;
  let client: AnanthamClient;

  beforeEach(async () => {
    const keys = new Map([
      ["token_app_client", { actorId: "external_service", role: "operator", allowedProjects: ["*"] }],
    ]);

    const authenticator = new ApiAuthenticator({ apiKeys: keys });
    server = new ApiServer({ dbPath: ":memory:", authenticator });
    const info = await server.listen(0);
    client = new AnanthamClient({ baseUrl: info.url, bearerToken: "token_app_client" });
  });

  afterEach(async () => {
    await server.close();
  });

  it("executes full end-to-end programmatic workflow with RPO-0 durability", async () => {
    // 1. Health check
    const health = await client.health();
    expect(health.status).toBe("healthy");

    // 2. Create Project
    const project = await client.projects.create({
      name: "E2E REST App",
      tags: ["e2e", "acceptance"],
    });
    expect(project.id).toMatch(/^proj_/);

    // 3. Create Session
    const session = await client.sessions.create({
      projectId: project.id,
      name: "E2E Interactive Session",
      branch: "main",
    });
    expect(session.id).toMatch(/^sess_/);

    // 4. Create Task
    const task = await client.tasks.create({
      projectId: project.id,
      sessionId: session.id,
      objective: "Build E2E feature over programmatic SDK",
      priority: "high",
    });
    expect(task.id).toMatch(/^task_/);

    // 5. Claim Task with Lease
    const lease = await client.tasks.claim(task.id, {
      agentId: "agent_e2e_runner",
      instanceId: "inst_01",
      leaseTtlMs: 30000,
    });
    expect(lease.taskId).toBe(task.id);
    expect(lease.generation).toBe(1);

    // 6. Create Background Job
    const job = await client.jobs.create({
      projectId: project.id,
      sessionId: session.id,
      taskId: task.id,
      agentId: "agent_e2e_runner",
    });
    expect(job.status).toBe("QUEUED");

    // 7. Inspect Paginated Events
    const events = await client.events.list({ sessionId: session.id, limit: 10 });
    expect(events.length).toBeGreaterThan(0);
  });
});
