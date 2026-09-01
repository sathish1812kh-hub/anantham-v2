import { describe, it, expect } from "vitest";
import { ApiIdempotencyManager, IdempotencyConflictError } from "../../src/api/api-idempotency-manager.js";

describe("W-03 ApiIdempotencyManager Context Scoping & Conflict Defense", () => {
  it("rejects cross-endpoint key reuse with IdempotencyConflictError", () => {
    const manager = new ApiIdempotencyManager();
    const key = "idemp_test_01";

    manager.set(key, 201, { id: "proj_1" }, {
      method: "POST",
      pathname: "/v1/projects",
      bodyHash: "hash_payload_A",
    });

    // Same endpoint and same payload returns cached response
    const cached = manager.get(key, {
      method: "POST",
      pathname: "/v1/projects",
      bodyHash: "hash_payload_A",
    });
    expect(cached).toBeDefined();
    expect(cached?.statusCode).toBe(201);

    // Different endpoint with same key throws conflict error
    expect(() => {
      manager.get(key, {
        method: "POST",
        pathname: "/v1/sessions",
        bodyHash: "hash_payload_A",
      });
    }).toThrow(IdempotencyConflictError);

    // Same endpoint with mutated payload throws conflict error
    expect(() => {
      manager.get(key, {
        method: "POST",
        pathname: "/v1/projects",
        bodyHash: "hash_payload_MUTATED",
      });
    }).toThrow(IdempotencyConflictError);
  });
});
