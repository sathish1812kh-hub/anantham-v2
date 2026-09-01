import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApiServer } from "../../src/api/api-server.js";
import { AnanthamClient } from "../../src/sdk/anantham-client.js";
import { AnanthamApiError } from "../../src/sdk/sdk-errors.js";

describe("P8.3 SDK — Error Unrolling & Contract Parity", () => {
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

  it("unrolls typed AnanthamApiError on bad request or schema failure", async () => {
    try {
      await client.projects.create({ name: "" });
      expect.unreachable("Should throw AnanthamApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(AnanthamApiError);
      const apiErr = err as AnanthamApiError;
      expect(apiErr.statusCode).toBe(400);
      expect(apiErr.classification).toBe("VALIDATION_ERROR");
    }
  });
});
