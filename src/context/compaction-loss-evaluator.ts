import { z } from "zod";
import type { ContextPlan } from "../domain/context.js";
import type { CompactionSummary } from "../compaction/compaction-types.js";

export const FactCategorySchema = z.enum([
  "objective",
  "acceptance_criteria",
  "constraint",
  "decision",
  "changed_file",
  "unresolved_error",
  "artifact_reference",
]);
export type FactCategory = z.infer<typeof FactCategorySchema>;

export const ProbeAssertionSchema = z.object({
  id: z.string().min(1),
  category: FactCategorySchema,
  promptQuery: z.string().min(1),
  expectedContent: z.string().min(1),
  sourceItemId: z.string().min(1),
  criticality: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]),
});
export type ProbeAssertion = z.infer<typeof ProbeAssertionSchema>;

export const ProbeEvaluationResultSchema = z.object({
  probeId: z.string().min(1),
  category: FactCategorySchema,
  criticality: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]),
  passed: z.boolean(),
  matchScore: z.number().min(0).max(1),
  details: z.string(),
});
export type ProbeEvaluationResult = z.infer<typeof ProbeEvaluationResultSchema>;

export const CompactionLossMetricsSchema = z.object({
  totalProbes: z.number().int().nonnegative(),
  passedProbes: z.number().int().nonnegative(),
  failedProbes: z.number().int().nonnegative(),
  criticalLossCount: z.number().int().nonnegative(),
  fidelityScore: z.number().min(0).max(1),
  categoryFidelity: z.record(FactCategorySchema, z.number().min(0).max(1)),
  tokenReductionRatio: z.number().min(0).max(1),
  compressionEfficiencyScore: z.number().min(0).max(1),
  criticalLossDetected: z.boolean(),
  evaluations: z.array(ProbeEvaluationResultSchema),
  evaluatedAt: z.string().min(1),
});
export type CompactionLossMetrics = z.infer<typeof CompactionLossMetricsSchema>;

export class CompactionLossExceededError extends Error {
  public readonly metrics: CompactionLossMetrics;

  constructor(message: string, metrics: CompactionLossMetrics) {
    super(message);
    this.name = "CompactionLossExceededError";
    this.metrics = metrics;
  }
}

export class CompactionLossEvaluator {
  private calculateFuzzyMatch(expected: string, text: string): number {
    const expNorm = expected.toLowerCase().trim();
    const textNorm = text.toLowerCase();

    if (textNorm.includes(expNorm)) {
      return 1.0;
    }

    const expWords = expNorm.split(/\s+/).filter((w) => w.length > 2);
    if (expWords.length === 0) return 0.5;

    let matched = 0;
    for (const word of expWords) {
      if (textNorm.includes(word)) {
        matched++;
      }
    }

    return matched / expWords.length;
  }

  public extractProbes(prePlan: ContextPlan): ProbeAssertion[] {
    const probes: ProbeAssertion[] = [];
    let probeIdx = 1;

    for (const item of prePlan.items) {
      const content = item.content || item.selectedBecause || "";

      if (item.priority === "CRITICAL") {
        probes.push({
          id: "prb_" + probeIdx++,
          category: "objective",
          promptQuery: "Verify primary task objective",
          expectedContent: content.slice(0, 100),
          sourceItemId: item.id,
          criticality: "CRITICAL",
        });
      }

      // Check for file paths in item content
      const filePathMatches = content.match(/[a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+/g);
      if (filePathMatches) {
        for (const fileMatch of filePathMatches.slice(0, 3)) {
          probes.push({
            id: "prb_" + probeIdx++,
            category: "changed_file",
            promptQuery: "Verify reference to file: " + fileMatch,
            expectedContent: fileMatch,
            sourceItemId: item.id,
            criticality: item.priority === "CRITICAL" ? "CRITICAL" : "HIGH",
          });
        }
      }

      // Check for errors
      if (/error|exception|fail/i.test(content)) {
        probes.push({
          id: "prb_" + probeIdx++,
          category: "unresolved_error",
          promptQuery: "Verify error diagnosis context",
          expectedContent: content.slice(0, 80),
          sourceItemId: item.id,
          criticality: "HIGH",
        });
      }

      // Check for artifacts
      if (item.sourceType === "artifact") {
        probes.push({
          id: "prb_" + probeIdx++,
          category: "artifact_reference",
          promptQuery: "Verify artifact presence",
          expectedContent: item.sourceId,
          sourceItemId: item.id,
          criticality: "HIGH",
        });
      }

      // Check for decisions
      if (/decision|selected|chosen|decided|approved/i.test(content)) {
        probes.push({
          id: "prb_" + probeIdx++,
          category: "decision",
          promptQuery: "Verify architecture decision",
          expectedContent: content.slice(0, 80),
          sourceItemId: item.id,
          criticality: "HIGH",
        });
      }
    }

    return probes;
  }

  public evaluateCompactionLoss(
    prePlan: ContextPlan,
    summary: CompactionSummary,
    postPlan?: ContextPlan
  ): CompactionLossMetrics {
    const probes = this.extractProbes(prePlan);

    // Build comprehensive text bag from summary and surviving postPlan items
    const summaryTextChunks: string[] = [
      summary.objective,
      summary.currentState,
      ...summary.facts,
      ...summary.decisions,
      ...summary.constraints,
      ...summary.unresolved,
      ...summary.pendingActions,
      ...summary.artifactReferences.map((a) => (a.artifactId + " " + (a.uri ?? "") + " " + (a.description ?? ""))),
    ];

    if (postPlan) {
      for (const it of postPlan.items) {
        if (it.content) summaryTextChunks.push(it.content);
        if (it.sourceId) summaryTextChunks.push(it.sourceId);
        if (it.selectedBecause) summaryTextChunks.push(it.selectedBecause);
      }
    }

    const aggregatedPostText = summaryTextChunks.join(" ");

    const evaluations: ProbeEvaluationResult[] = [];
    let passedCount = 0;
    let criticalLossCount = 0;
    let weightedScoreSum = 0;
    let totalWeight = 0;

    const categoryScores: Record<FactCategory, { total: number; sum: number }> = {
      objective: { total: 0, sum: 0 },
      acceptance_criteria: { total: 0, sum: 0 },
      constraint: { total: 0, sum: 0 },
      decision: { total: 0, sum: 0 },
      changed_file: { total: 0, sum: 0 },
      unresolved_error: { total: 0, sum: 0 },
      artifact_reference: { total: 0, sum: 0 },
    };

    const weights = { CRITICAL: 4, HIGH: 2, NORMAL: 1, LOW: 1 };

    for (const probe of probes) {
      const matchScore = this.calculateFuzzyMatch(probe.expectedContent, aggregatedPostText);
      const passed = matchScore >= 0.75;

      if (passed) {
        passedCount++;
      } else if (probe.criticality === "CRITICAL") {
        criticalLossCount++;
      }

      const weight = weights[probe.criticality];
      weightedScoreSum += matchScore * weight;
      totalWeight += weight;

      categoryScores[probe.category].total++;
      categoryScores[probe.category].sum += matchScore;

      evaluations.push({
        probeId: probe.id,
        category: probe.category,
        criticality: probe.criticality,
        passed,
        matchScore,
        details: passed
          ? "Probe passed with score " + matchScore.toFixed(2)
          : "Information loss detected for probe: " + probe.expectedContent.slice(0, 50),
      });
    }

    const fidelityScore = totalWeight > 0 ? weightedScoreSum / totalWeight : 1.0;
    const criticalLossDetected = criticalLossCount > 0 || (probes.length > 0 && fidelityScore < 0.75);

    const categoryFidelity: Record<FactCategory, number> = {
      objective: categoryScores.objective.total > 0 ? categoryScores.objective.sum / categoryScores.objective.total : 1.0,
      acceptance_criteria: categoryScores.acceptance_criteria.total > 0 ? categoryScores.acceptance_criteria.sum / categoryScores.acceptance_criteria.total : 1.0,
      constraint: categoryScores.constraint.total > 0 ? categoryScores.constraint.sum / categoryScores.constraint.total : 1.0,
      decision: categoryScores.decision.total > 0 ? categoryScores.decision.sum / categoryScores.decision.total : 1.0,
      changed_file: categoryScores.changed_file.total > 0 ? categoryScores.changed_file.sum / categoryScores.changed_file.total : 1.0,
      unresolved_error: categoryScores.unresolved_error.total > 0 ? categoryScores.unresolved_error.sum / categoryScores.unresolved_error.total : 1.0,
      artifact_reference: categoryScores.artifact_reference.total > 0 ? categoryScores.artifact_reference.sum / categoryScores.artifact_reference.total : 1.0,
    };

    const tokensBefore = prePlan.estimatedTokens;
    const tokensAfter = postPlan?.estimatedTokens ?? 0;
    const tokenReductionRatio = tokensBefore > 0 ? Math.max(0, (tokensBefore - tokensAfter) / tokensBefore) : 0;

    return {
      totalProbes: probes.length,
      passedProbes: passedCount,
      failedProbes: probes.length - passedCount,
      criticalLossCount,
      fidelityScore,
      categoryFidelity,
      tokenReductionRatio,
      compressionEfficiencyScore: tokenReductionRatio,
      criticalLossDetected,
      evaluations,
      evaluatedAt: new Date().toISOString(),
    };
  }

  public assertCompactionAcceptable(metrics: CompactionLossMetrics, minFidelity: number = 0.80): void {
    if (metrics.criticalLossDetected) {
      throw new CompactionLossExceededError(
        "Critical information loss detected during context compaction (" + metrics.criticalLossCount + " critical fact(s) lost).",
        metrics
      );
    }
    if (metrics.fidelityScore < minFidelity) {
      throw new CompactionLossExceededError(
        "Compaction fidelity score " + metrics.fidelityScore.toFixed(2) + " is below acceptable threshold " + minFidelity.toFixed(2),
        metrics
      );
    }
  }
}
