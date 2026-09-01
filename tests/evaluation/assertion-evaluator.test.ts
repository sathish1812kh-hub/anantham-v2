import { describe, it, expect } from "vitest";
import { AssertionEvaluator } from "../../src/evaluation/assertion-evaluator.js";
import { type CollectedEvidence } from "../../src/evaluation/evidence-collector.js";
import { type EvaluationAssertion } from "../../src/domain/evaluation.js";

describe("P9.1 Evaluation — Objective Assertion Evaluator", () => {
  it("evaluates STATE_EQUALS, EVENT_EXISTS, and ARTIFACT_EXISTS assertions", () => {
    const evidence: CollectedEvidence = {
      events: [
        {
          id: "evt_1",
          schemaVersion: 1,
          type: "task.completed",
          actor: "agent",
          timestamp: new Date().toISOString(),
          payload: {},
        },
      ],
      stateSnapshots: { "task.status": "completed", "workflow.status": "RUNNING" },
      policyDecisions: ["PERMIT"],
      artifacts: [{ id: "art_1", path: "/dist/bundle.js", hash: "sha256_hash_123" }],
      metrics: { "tool.duration": 120 },
    };

    const stateAsrt: EvaluationAssertion = {
      id: "a1",
      type: "STATE_EQUALS",
      target: "task.status",
      expected: "completed",
      description: "Task is completed",
      criticality: "CRITICAL",
    };
    const res1 = AssertionEvaluator.evaluate(stateAsrt, evidence);
    expect(res1.passed).toBe(true);

    const eventAsrt: EvaluationAssertion = {
      id: "a2",
      type: "EVENT_EXISTS",
      target: "task.completed",
      expected: true,
      description: "Task completed event exists",
      criticality: "CRITICAL",
    };
    const res2 = AssertionEvaluator.evaluate(eventAsrt, evidence);
    expect(res2.passed).toBe(true);

    const artAsrt: EvaluationAssertion = {
      id: "a3",
      type: "ARTIFACT_EXISTS",
      target: "/dist/bundle.js",
      expected: true,
      description: "Artifact exists",
      criticality: "CRITICAL",
    };
    const res3 = AssertionEvaluator.evaluate(artAsrt, evidence);
    expect(res3.passed).toBe(true);
  });

  it("evaluates SECRET_ABSENT and detects raw credentials", () => {
    const cleanEvidence: CollectedEvidence = {
      events: [],
      stateSnapshots: { output: "safe user text" },
      policyDecisions: [],
      artifacts: [],
      metrics: {},
    };

    const secretAsrt: EvaluationAssertion = {
      id: "asrt_sec",
      type: "SECRET_ABSENT",
      target: "output",
      expected: true,
      description: "No secrets leaked",
      criticality: "CRITICAL",
    };

    const cleanRes = AssertionEvaluator.evaluate(secretAsrt, cleanEvidence);
    expect(cleanRes.passed).toBe(true);

    const leakedEvidence: CollectedEvidence = {
      events: [
        {
          id: "evt_leak",
          schemaVersion: 1,
          type: "tool.output",
          actor: "tool",
          timestamp: new Date().toISOString(),
          payload: { key: "sk-abcdef1234567890abcdef1234567890" },
        },
      ],
      stateSnapshots: {},
      policyDecisions: [],
      artifacts: [],
      metrics: {},
    };

    const leakedRes = AssertionEvaluator.evaluate(secretAsrt, leakedEvidence);
    expect(leakedRes.passed).toBe(false);
  });
});
