import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApiServer } from "../../src/api/api-server.js";
import { AnanthamClient } from "../../src/sdk/anantham-client.js";

describe("P8.3 API — Projects & Sessions Resource Endpoints", () => {
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

  it("creates and lists projects via REST API", async () => {
    const project = await client.projects.create({
      name: "API Test Project",
      tags: ["test", "api"],
    });

    expect(project.id).toMatch(/^proj_/);
    expect(project.name).toBe("API Test Project");

    const list = await client.projects.list();
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(project.id);
  });

  it("creates and lists sessions in a project via REST API", async () => {
    const project = await client.projects.create({ name: "Session Test" });
    const session = await client.sessions.create({
      projectId: project.id,
      name: "Main Session",
      branch: "main",
    });

    expect(session.id).toMatch(/^sess_/);
    expect(session.projectId).toBe(project.id);

    const list = await client.sessions.list(project.id);
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(session.id);
  });
});
