import { describe, it, expect } from "vitest";
import {
  MemoryItemSchema,
  MemoryScopeSchema,
  MemoryPrioritySchema,
  type MemoryItem,
} from "../../src/domain/memory.js";

describe("MemoryItem Domain Contracts", () => {
  it("validates a scoped, provenance-linked MemoryItem", () => {
    const memory: MemoryItem = {
      id: "mem_001",
      scope: "project",
      projectId: "proj_01",
      type: "architecture-decision",
      content: "SQLite with WAL mode is the primary authoritative store.",
      confidence: 0.98,
      priority: "CRITICAL",
      sourceEventIds: ["evt_050"],
      sourceArtifacts: ["art_001"],
      createdAt: "2026-08-30T20:00:00.000Z",
      lastValidatedAt: "2026-08-30T20:15:00.000Z",
      sensitivity: "normal",
      tags: ["persistence", "sqlite", "wal"],
    };

    const parsed = MemoryItemSchema.parse(memory);
    expect(parsed).toEqual(memory);
  });

  it("validates all 6 memory scopes from PRD Part 1 Section 62", () => {
    const scopes = [
      "working",
      "session",
      "project",
      "agent",
      "global",
      "episodic",
    ];

    for (const s of scopes) {
      expect(MemoryScopeSchema.parse(s)).toBe(s);
    }
  });

  it("rejects confidence scores outside [0, 1]", () => {
    expect(() =>
      MemoryItemSchema.parse({
        id: "mem_002",
        scope: "working",
        type: "fact",
        content: "test",
        confidence: 1.5,
        priority: "NORMAL",
        sourceEventIds: [],
        createdAt: "2026-08-30T20:00:00.000Z",
        sensitivity: "normal",
      })
    ).toThrow();
  });
});
