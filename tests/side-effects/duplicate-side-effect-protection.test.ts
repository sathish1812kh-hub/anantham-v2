import { describe, it, expect } from "vitest";
import { SideEffectJournal } from "../../src/side-effects/side-effect-journal.js";
import { IdempotencyStore } from "../../src/tools/idempotency-store.js";

describe("P4.5 Duplicate Side-Effect Protection — Idempotency Key & Deduplication", () => {
  it("computes deterministic idempotency keys and request hashes", () => {
    const journal = new SideEffectJournal();

    const key1 = journal.computeIdempotencyKey("prj_1", "write_file", { path: "a.txt", content: "hello" }, "task_1");
    const key2 = journal.computeIdempotencyKey("prj_1", "write_file", { content: "hello", path: "a.txt" }, "task_1");
    const key3 = journal.computeIdempotencyKey("prj_1", "write_file", { path: "b.txt", content: "hello" }, "task_1");

    expect(key1).toBe(key2); // Parameter key order independence
    expect(key1).not.toBe(key3); // Different path produces different key
  });

  it("stores and deduplicates identical observations in IdempotencyStore", () => {
    const store = new IdempotencyStore();
    const observation = {
      callId: "call_01",
      toolName: "save_artifact",
      status: "success" as const,
      result: { artifactId: "art_100" },
      durationMs: 12,
      executedAt: new Date().toISOString(),
    };

    store.set("prj_1", "save_artifact", "key_art_01", observation);
    expect(store.has("prj_1", "save_artifact", "key_art_01")).toBe(true);

    const cached = store.get("prj_1", "save_artifact", "key_art_01");
    expect(cached).toBeDefined();
    expect(cached?.result).toEqual({ artifactId: "art_100" });
  });
});
