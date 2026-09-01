import { describe, it, expect } from "vitest";
import { type IncomingMessage } from "node:http";
import { ApiAuthenticator } from "../../src/api/api-authenticator.js";

describe("P8.3 API — Authentication & Credential Resolution", () => {
  it("authenticates valid Bearer token", () => {
    const keys = new Map([
      ["token_secret_123", { actorId: "operator_1", role: "operator", allowedProjects: ["proj_01"] }],
    ]);
    const authenticator = new ApiAuthenticator({ apiKeys: keys });

    const req = {
      headers: {
        authorization: "Bearer token_secret_123",
      },
    } as unknown as IncomingMessage;

    const auth = authenticator.authenticate(req);
    expect(auth.authenticated).toBe(true);
    expect(auth.actorId).toBe("operator_1");
    expect(auth.allowedProjects).toEqual(["proj_01"]);
  });

  it("authenticates valid X-API-Key header", () => {
    const keys = new Map([
      ["key_admin_456", { actorId: "admin_root", role: "admin", allowedProjects: ["*"] }],
    ]);
    const authenticator = new ApiAuthenticator({ apiKeys: keys });

    const req = {
      headers: {
        "x-api-key": "key_admin_456",
      },
    } as unknown as IncomingMessage;

    const auth = authenticator.authenticate(req);
    expect(auth.authenticated).toBe(true);
    expect(auth.actorId).toBe("admin_root");
    expect(auth.role).toBe("admin");
  });

  it("rejects invalid or missing token when anonymous disabled", () => {
    const authenticator = new ApiAuthenticator({ allowAnonymous: false });

    const req = {
      headers: {
        authorization: "Bearer invalid_token",
      },
    } as unknown as IncomingMessage;

    const auth = authenticator.authenticate(req);
    expect(auth.authenticated).toBe(false);
  });
});
