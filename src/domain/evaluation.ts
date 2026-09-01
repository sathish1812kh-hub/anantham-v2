import { z } from "zod";

/**
 * Benchmark Scenario Categories.
 * PRD Part 3 Section 80–120.
 */
export const BenchmarkCategorySchema = z.enum([
  "task_execution",
  "tool_use",
  "multi_step_agent",
  "parallel_execution",
  "workflow_dag",
  "approval_gate",
  "background_job",
  "lease_fencing",
  "crash_recovery",
  "remote_node",
  "mcp_interaction",
  "plugin_lifecycle",
  "skill_execution",
  "webhook_integration",
  "policy_denial",
  "prompt_injection",
  "secret_leakage",
  "project_isolation",
  "artifact_integrity",
  "false_completion",
]);
export type BenchmarkCategory = z.infer<typeof BenchmarkCategorySchema>;

/**
 * Evaluation Assertion Types.
 * PRD Part 3 Section 94.
 */
export const EvaluationAssertionTypeSchema = z.enum([
  "STATE_EQUALS",
  "EVENT_EXISTS",
  "ARTIFACT_EXISTS",
  "POLICY_DECISION",
  "TOOL_COUNT_LIMIT",
  "RESOURCE_LIMIT",
  "SECRET_ABSENT",
  "PROJECT_CONTAINMENT",
  "RECOVERY_SURVIVED",
]);
export type EvaluationAssertionType = z.infer<typeof EvaluationAssertionTypeSchema>;

/**
 * Machine-verifiable objective evaluation assertion.
 */
export const EvaluationAssertionSchema = z.object({
  id: z.string().min(1),
  type: EvaluationAssertionTypeSchema,
  target: z.string().min(1), // e.g. "task.status", "event.type", "artifact.path"
  expected: z.unknown(), // e.g. "completed", "policy.denied", hash string
  description: z.string().min(1),
  criticality: z.enum(["CRITICAL", "OPTIONAL"]).default("CRITICAL"),
});
export type EvaluationAssertion = z.infer<typeof EvaluationAssertionSchema>;

/**
 * Benchmark Case Contract.
 */
export const BenchmarkCaseSchema = z.object({
  caseId: z.string().min(1),
  datasetId: z.string().min(1),
  datasetVersion: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: BenchmarkCategorySchema,
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "ADVERSARIAL"]).default("MEDIUM"),
  scenario: z.string().min(1),
  inputs: z.record(z.unknown()).default({}),
  requiredTools: z.array(z.string()).default([]),
  requiredCapabilities: z.array(z.string()).default([]),
  assertions: z.array(EvaluationAssertionSchema),
  timeoutMs: z.number().int().positive().default(30000),
  tags: z.array(z.string()).default([]),
});
export type BenchmarkCase = z.infer<typeof BenchmarkCaseSchema>;

/**
 * Benchmark Dataset Contract.
 */
export const BenchmarkDatasetSchema = z.object({
  datasetId: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  cases: z.array(BenchmarkCaseSchema),
});
export type BenchmarkDataset = z.infer<typeof BenchmarkDatasetSchema>;

/**
 * Result of evaluating an individual assertion.
 */
export const AssertionEvaluationResultSchema = z.object({
  assertionId: z.string().min(1),
  passed: z.boolean(),
  expected: z.unknown(),
  observed: z.unknown(),
  evidence: z.string(),
  criticality: z.enum(["CRITICAL", "OPTIONAL"]),
});
export type AssertionEvaluationResult = z.infer<typeof AssertionEvaluationResultSchema>;

/**
 * Result of evaluating a single benchmark case.
 */
export const EvaluationCaseResultSchema = z.object({
  caseId: z.string().min(1),
  status: z.enum(["PASS", "FAIL", "PARTIAL", "INCONCLUSIVE"]),
  score: z.number().min(0).max(100),
  assertionResults: z.array(AssertionEvaluationResultSchema),
  evidence: z.record(z.unknown()).default({}),
  failureClassification: z
    .enum([
      "NONE",
      "BENCHMARK_DEFINITION",
      "RUNTIME",
      "POLICY",
      "SECURITY",
      "TIMEOUT",
      "ASSERTION",
      "RECOVERY",
      "RESOURCE",
    ])
    .default("NONE"),
  durationMs: z.number().min(0),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
});
export type EvaluationCaseResult = z.infer<typeof EvaluationCaseResultSchema>;

/**
 * Provenance metadata for an evaluation run.
 */
export const EvaluationProvenanceSchema = z.object({
  runtimeVersion: z.string().min(1),
  gitCommit: z.string().min(1),
  datasetId: z.string().min(1),
  datasetVersion: z.string().min(1),
  modelProfile: z.string().default("default"),
  seed: z.number().optional(),
  environment: z.string().default("node-test"),
});
export type EvaluationProvenance = z.infer<typeof EvaluationProvenanceSchema>;

/**
 * Authoritative Evaluation Run.
 */
export const EvaluationRunSchema = z.object({
  id: z.string().min(1),
  datasetId: z.string().min(1),
  datasetVersion: z.string().min(1),
  status: z.enum(["RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
  summary: z.object({
    totalCases: z.number().int().min(0),
    passedCases: z.number().int().min(0),
    failedCases: z.number().int().min(0),
    partialCases: z.number().int().min(0),
    inconclusiveCases: z.number().int().min(0),
    overallScore: z.number().min(0).max(100),
  }),
  results: z.array(EvaluationCaseResultSchema),
  provenance: EvaluationProvenanceSchema,
  createdAt: z.string().min(1),
  completedAt: z.string().optional(),
});
export type EvaluationRun = z.infer<typeof EvaluationRunSchema>;

/**
 * Regression analysis comparing two evaluation runs.
 */
export const RegressionComparisonSchema = z.object({
  baselineRunId: z.string().min(1),
  currentRunId: z.string().min(1),
  datasetId: z.string().min(1),
  scoreDelta: z.number(),
  newFailures: z.array(z.string()),
  fixedFailures: z.array(z.string()),
  unchangedFailures: z.array(z.string()),
  regressionDetected: z.boolean(),
});
export type RegressionComparison = z.infer<typeof RegressionComparisonSchema>;

/**
 * Comprehensive Evaluation Report.
 */
export const EvaluationReportSchema = z.object({
  reportId: z.string().min(1),
  runId: z.string().min(1),
  generatedAt: z.string().min(1),
  run: EvaluationRunSchema,
  regression: RegressionComparisonSchema.optional(),
});
export type EvaluationReport = z.infer<typeof EvaluationReportSchema>;
