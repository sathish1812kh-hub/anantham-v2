import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApiServer } from "../../src/api/api-server.js";
import { AnanthamClient } from "../../src/sdk/anantham-client.js";

describe("P8.3 API — Idempotency & Deduplication with Idempotency-Key", () => {
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

  it("returns identical cached response for duplicated mutating request with same Idempotency-Key", async () => {
    const idempotencyKey = "key_req_12345";

    // First request
    const p1 = await client.projects.create({ name: "Idempotent Project" }, idempotencyKey);

    // Duplicate request
    const p2 = await client.projects.create({ name: "Idempotent Project" }, idempotencyKey);

    expect(p1.id).toBe(p2.id);

    // Only 1 project created in repository
    const all = await client.projects.list();
    expect(all.length).toBe(1);
  });
});
