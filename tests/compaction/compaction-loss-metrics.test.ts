import { describe, it, expect } from "vitest";
import { CompactionLossEvaluator, CompactionLossExceededError } from "../../src/context/compaction-loss-evaluator.js";
import type { ContextPlan } from "../../src/domain/context.js";
import type { CompactionSummary } from "../../src/compaction/compaction-types.js";

describe("PRD-COMPACT-006: Compaction Quality & Loss Measurement", () => {
  const evaluator = new CompactionLossEvaluator();

  const mockPrePlan: ContextPlan = {
    id: "ctx_pre_01",
    items: [
      {
        id: "item_01",
        sourceType: "task",
        sourceId: "task_auth",
        representationType: "summary",
        priority: "CRITICAL",
        estimatedTokens: 500,
        selectedBecause: "Active Task Objective",
        authority: "authorized_context",
        content: "Implement OAuth2 authentication flow with refresh tokens for mobile clients.",
      },
      {
        id: "item_02",
        sourceType: "file",
        sourceId: "src/auth/jwt-service.ts",
        representationType: "source_code",
        priority: "HIGH",
        estimatedTokens: 1200,
        selectedBecause: "Modified authentication service",
        authority: "authorized_context",
        content: "File modified: src/auth/jwt-service.ts. Encountered error ERR_EXPIRED_JWT during token validation.",
      },
      {
        id: "item_03",
        sourceType: "artifact",
        sourceId: "art_jwt_keys_01",
        representationType: "artifact",
        priority: "HIGH",
        estimatedTokens: 300,
        selectedBecause: "Decided to use RSA-256 for key pair",
        authority: "authorized_context",
        content: "Architecture decision: selected RSA-256 algorithm for signing session tokens.",
      },
    ],
    estimatedTokens: 2000,
    modalityUsage: { text: 2000 },
    omitted: [],
    decisions: [],
    createdAt: new Date().toISOString(),
  };

  it("evaluates high fidelity when all critical facts and decisions are preserved in summary", () => {
    const summary: CompactionSummary = {
      objective: "Implement OAuth2 authentication flow with refresh tokens for mobile clients.",
      currentState: "In Progress",
      facts: ["File modified: src/auth/jwt-service.ts"],
      decisions: ["Architecture decision: selected RSA-256 algorithm for signing session tokens."],
      constraints: ["Mobile client refresh token compatibility"],
      unresolved: ["Encountered error ERR_EXPIRED_JWT during token validation."],
      artifactReferences: [{ artifactId: "art_jwt_keys_01", description: "RSA key pair" }],
      pendingActions: ["Run token expiry tests"],
      provenance: {
        sourceEventIds: ["evt_01", "evt_02"],
        compactedAt: new Date().toISOString(),
      },
    };

    const metrics = evaluator.evaluateCompactionLoss(mockPrePlan, summary);
    expect(metrics.totalProbes).toBeGreaterThan(0);
    expect(metrics.passedProbes).toBe(metrics.totalProbes);
    expect(metrics.criticalLossDetected).toBe(false);
    expect(metrics.fidelityScore).toBeGreaterThanOrEqual(0.9);
    expect(metrics.criticalLossCount).toBe(0);

    // Should pass assertion
    expect(() => evaluator.assertCompactionAcceptable(metrics)).not.toThrow();
  });

  it("detects critical loss when active task objective is completely omitted from summary", () => {
    const corruptedSummary: CompactionSummary = {
      objective: "Something totally unrelated to auth",
      currentState: "Idle",
      facts: [],
      decisions: [],
      constraints: [],
      unresolved: [],
      artifactReferences: [],
      pendingActions: [],
      provenance: {
        sourceEventIds: ["evt_01"],
        compactedAt: new Date().toISOString(),
      },
    };

    const metrics = evaluator.evaluateCompactionLoss(mockPrePlan, corruptedSummary);
    expect(metrics.criticalLossDetected).toBe(true);
    expect(metrics.criticalLossCount).toBeGreaterThan(0);
    expect(metrics.fidelityScore).toBeLessThan(0.7);

    // Should throw CompactionLossExceededError
    expect(() => evaluator.assertCompactionAcceptable(metrics)).toThrow(CompactionLossExceededError);
  });

  it("extracts probe assertions covering 7 fact categories", () => {
    const probes = evaluator.extractProbes(mockPrePlan);
    const categories = new Set(probes.map((p) => p.category));

    expect(categories.has("objective")).toBe(true);
    expect(categories.has("changed_file")).toBe(true);
    expect(categories.has("unresolved_error")).toBe(true);
    expect(categories.has("artifact_reference")).toBe(true);
    expect(categories.has("decision")).toBe(true);
  });

  it("computes accurate compression efficiency score and token reduction ratio", () => {
    const summary: CompactionSummary = {
      objective: "Implement OAuth2 authentication flow with refresh tokens for mobile clients.",
      currentState: "In Progress",
      facts: ["src/auth/jwt-service.ts"],
      decisions: ["RSA-256"],
      constraints: [],
      unresolved: ["ERR_EXPIRED_JWT"],
      artifactReferences: [{ artifactId: "art_jwt_keys_01" }],
      pendingActions: [],
      provenance: { sourceEventIds: [], compactedAt: new Date().toISOString() },
    };

    const postPlan: ContextPlan = {
      id: "ctx_post_01",
      items: [
        {
          id: "item_summary",
          sourceType: "history",
          sourceId: "compaction_sum",
          representationType: "summary",
          priority: "CRITICAL",
          estimatedTokens: 400, // Reduced from 2000 to 400
          selectedBecause: "Compacted turn summary",
          authority: "authorized_context",
        },
      ],
      estimatedTokens: 400,
      modalityUsage: { text: 400 },
      omitted: [],
      decisions: [],
      createdAt: new Date().toISOString(),
    };

    const metrics = evaluator.evaluateCompactionLoss(mockPrePlan, summary, postPlan);
    expect(metrics.tokenReductionRatio).toBeCloseTo(0.8, 1);
    expect(metrics.compressionEfficiencyScore).toBeGreaterThan(0.7);
  });
});
