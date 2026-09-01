import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApiServer } from "../../src/api/api-server.js";
import { AnanthamClient } from "../../src/sdk/anantham-client.js";
import { EventTypes } from "../../src/domain/event.js";

describe("P8.3 API — Event Stream & Paginated Queries", () => {
  let server: ApiServer;
  let client: AnanthamClient;

  beforeEach(async () => {
    server = new ApiServer({ dbPath: ":memory:" });
    const info = await server.listen(0);
    client = new AnanthamClient({ baseUrl: info.url });

    // Seed events
    server.projectRepo.save({
      id: "proj_evt",
      name: "Event App",
      rootPath: "/app",
      status: "active",
      tags: [],
      modelProfile: "default",
      memoryNamespace: "default",
      orchestrationProfile: "default",
      trustProfile: "safe",
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      metadata: {},
    });

    server.sessionRepo.save({
      id: "sess_evt",
      projectId: "proj_evt",
      name: "Session Evt",
      branch: "main",
      status: "active",
      modelProfile: "default",
      keyPoolProfile: "default",
      mode: "interactive",
      permissions: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });

    for (let i = 1; i <= 5; i++) {
      server.eventStore.append({
        id: `evt_test_${i}`,
        schemaVersion: 1,
        type: EventTypes.TASK_CREATED,
        timestamp: new Date().toISOString(),
        actor: "agent",
        projectId: "proj_evt",
        sessionId: "sess_evt",
        taskId: `task_${i}`,
        payload: { index: i },
      });
    }
  });

  afterEach(async () => {
    await server.close();
  });

  it("queries paginated events with limit and offset", async () => {
    const page1 = await client.events.list({ sessionId: "sess_evt", limit: 3, offset: 0 });
    expect(page1.length).toBe(3);

    const page2 = await client.events.list({ sessionId: "sess_evt", limit: 3, offset: 3 });
    expect(page2.length).toBe(2);
  });
});
