import { describe, it, expect } from "vitest";
import {
  SideEffectCategorySchema,
  OutcomeCertaintySchema,
  RetryDecisionSchema,
  RetryBudgetConfigSchema,
  FileDivergenceRecordSchema,
  WorktreeDivergenceRecordSchema,
  SideEffectJournalEntrySchema,
} from "../../src/domain/side-effect.js";

describe("P4.5 Side Effects — Domain Contracts & Runtime Validation", () => {
  it("validates SideEffectCategory schema", () => {
    expect(SideEffectCategorySchema.parse("read_only")).toBe("read_only");
    expect(SideEffectCategorySchema.parse("idempotent_write")).toBe("idempotent_write");
    expect(SideEffectCategorySchema.parse("reversible_write")).toBe("reversible_write");
    expect(SideEffectCategorySchema.parse("non_idempotent_write")).toBe("non_idempotent_write");
    expect(SideEffectCategorySchema.parse("unknown")).toBe("unknown");
    expect(() => SideEffectCategorySchema.parse("invalid_category")).toThrow();
  });

  it("validates OutcomeCertainty schema", () => {
    expect(OutcomeCertaintySchema.parse("known_succeeded")).toBe("known_succeeded");
    expect(OutcomeCertaintySchema.parse("known_failed")).toBe("known_failed");
    expect(OutcomeCertaintySchema.parse("unknown")).toBe("unknown");
    expect(() => OutcomeCertaintySchema.parse("uncertain")).toThrow();
  });

  it("validates RetryDecision schema", () => {
    const valid = RetryDecisionSchema.parse({
      decisionCode: "allow_retry",
      allowRetry: true,
      reason: "Transient rate limit error",
      attemptNumber: 1,
      maxAttempts: 3,
      budgetRemaining: 2,
      recommendedDelayMs: 400,
    });
    expect(valid.allowRetry).toBe(true);
    expect(valid.decisionCode).toBe("allow_retry");
  });

  it("validates FileDivergenceRecord and WorktreeDivergenceRecord schemas", () => {
    const fileDiv = FileDivergenceRecordSchema.parse({
      filePath: "C:/project/src/index.ts",
      baseHash: "a1b2c3d4",
      currentHash: "e5f6g7h8",
      status: "diverged",
      detectedAt: new Date().toISOString(),
    });
    expect(fileDiv.status).toBe("diverged");

    const worktreeDiv = WorktreeDivergenceRecordSchema.parse({
      worktreePath: "C:/project",
      branch: "main",
      hasUncommittedChanges: true,
      modifiedFiles: ["src/index.ts"],
      status: "diverged",
      detectedAt: new Date().toISOString(),
    });
    expect(worktreeDiv.hasUncommittedChanges).toBe(true);
  });

  it("validates SideEffectJournalEntry schema", () => {
    const entry = SideEffectJournalEntrySchema.parse({
      journalId: "jnl_001",
      projectId: "prj_001",
      callId: "call_001",
      toolName: "write_file",
      category: "idempotent_write",
      outcomeCertainty: "known_succeeded",
      requestHash: "hash_abc",
      attemptNumber: 1,
      executedAt: new Date().toISOString(),
    });
    expect(entry.toolName).toBe("write_file");
    expect(entry.category).toBe("idempotent_write");
  });
});
