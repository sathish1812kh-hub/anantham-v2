import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApiServer } from "../../src/api/api-server.js";
import { ApiAuthenticator } from "../../src/api/api-authenticator.js";
import { AnanthamClient } from "../../src/sdk/anantham-client.js";

describe("P8.3 API — Project Isolation & Tenant Boundary Enforcement", () => {
  let server: ApiServer;
  let serverUrl: string;

  beforeEach(async () => {
    const keys = new Map([
      ["token_tenant_a", { actorId: "user_a", role: "operator", allowedProjects: ["proj_a"] }],
      ["token_tenant_b", { actorId: "user_b", role: "operator", allowedProjects: ["proj_b"] }],
    ]);

    const authenticator = new ApiAuthenticator({ apiKeys: keys });
    server = new ApiServer({ dbPath: ":memory:", authenticator });
    const info = await server.listen(0);
    serverUrl = info.url;

    // Seed projects
    server.projectRepo.save({
      id: "proj_a",
      name: "Project A",
      rootPath: "/a",
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

    server.projectRepo.save({
      id: "proj_b",
      name: "Project B",
      rootPath: "/b",
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
  });

  afterEach(async () => {
    await server.close();
  });

  it("permits tenant A to list its own project but denies access to project B", async () => {
    const clientA = new AnanthamClient({ baseUrl: serverUrl, bearerToken: "token_tenant_a" });

    // 1. Tenant A lists projects -> sees only proj_a
    const projects = await clientA.projects.list();
    expect(projects.length).toBe(1);
    expect(projects[0]!.id).toBe("proj_a");

    // 2. Tenant A tries to access sessions of proj_b -> Forbidden
    await expect(clientA.sessions.list("proj_b")).rejects.toThrow(/Forbidden/);
  });
});
