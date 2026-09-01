import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApiServer } from "../../src/api/api-server.js";
import { AnanthamClient } from "../../src/sdk/anantham-client.js";

describe("P8.3 SDK — Typed TypeScript Client SDK", () => {
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

  it("checks health and system doctor via SDK", async () => {
    const health = await client.health();
    expect(health.status).toBe("healthy");

    const doctor = await client.doctor();
    expect(doctor.sqliteWal).toBe("HEALTHY");
  });

  it("lists nodes and artifacts through SDK", async () => {
    const nodes = await client.nodes.list();
    expect(Array.isArray(nodes)).toBe(true);

    const artifacts = await client.artifacts.list("sess_nonexistent");
    expect(artifacts).toEqual([]);
  });
});
