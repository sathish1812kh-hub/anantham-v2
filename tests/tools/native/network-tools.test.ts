import { describe, it, expect } from "vitest";
import { createNetworkTools } from "../../../src/tools/native/network-tools.js";

describe("P4.3 Native Network Tools — HTTP Fetch & SSRF Boundaries", () => {
  it("SSRF DEFENSE: Blocks requests to localhost and private network addresses", async () => {
    const [fetchUrl] = createNetworkTools({ allowLocalhost: false });

    await expect(
      fetchUrl.handler(
        { url: "http://127.0.0.1:8080/admin" },
        { callId: "n1", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
      )
    ).rejects.toThrow("blocked by SSRF policy");

    await expect(
      fetchUrl.handler(
        { url: "http://169.254.169.254/latest/meta-data" },
        { callId: "n2", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
      )
    ).rejects.toThrow("blocked by SSRF policy");
  });

  it("rejects non-HTTP protocols", async () => {
    const [fetchUrl] = createNetworkTools();

    await expect(
      fetchUrl.handler(
        { url: "file:///etc/passwd" },
        { callId: "n3", actor: { id: "a1", type: "agent" }, project: { id: "p1" } }
      )
    ).rejects.toThrow("Only HTTP/HTTPS allowed");
  });
});
