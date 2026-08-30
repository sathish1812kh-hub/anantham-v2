import { describe, it, expect } from "vitest";
import { IdempotencyStore } from "../../src/tools/idempotency-store.js";

describe("P4.5 Side Effect Plane — Concurrency & In-Flight Locks", () => {
  it("prevents concurrent identical in-flight executions for same idempotency key", () => {
    const store = new IdempotencyStore();

    // First request acquires lock
    const lock1 = store.acquireLock("prj_1", "deploy_service", "idemp_key_1");
    expect(lock1).toBe(true);

    // Second concurrent request with same key is rejected
    const lock2 = store.acquireLock("prj_1", "deploy_service", "idemp_key_1");
    expect(lock2).toBe(false);

    // Release lock
    store.releaseLock("prj_1", "deploy_service", "idemp_key_1");

    // Third request can now acquire lock
    const lock3 = store.acquireLock("prj_1", "deploy_service", "idemp_key_1");
    expect(lock3).toBe(true);
  });
});
