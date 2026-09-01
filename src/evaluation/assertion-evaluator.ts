import {
  type EvaluationAssertion,
  type AssertionEvaluationResult,
  AssertionEvaluationResultSchema,
} from "../domain/evaluation.js";
import { type CollectedEvidence } from "./evidence-collector.js";

/**
 * Objective Assertion Evaluator.
 * PRD Part 3 Section 94.
 */
export class AssertionEvaluator {
  /**
   * Evaluates an individual assertion against collected objective evidence.
   */
  public static evaluate(
    assertion: EvaluationAssertion,
    evidence: CollectedEvidence
  ): AssertionEvaluationResult {
    let passed = false;
    let observed: unknown = undefined;
    let evidenceStr = "";

    switch (assertion.type) {
      case "STATE_EQUALS": {
        observed = evidence.stateSnapshots[assertion.target];
        passed = observed === assertion.expected;
        evidenceStr = `Observed state '${assertion.target}' = '${String(observed)}' (expected: '${String(assertion.expected)}')`;
        break;
      }

      case "EVENT_EXISTS": {
        const matchingEvents = evidence.events.filter((e) => e.type === assertion.target);
        observed = matchingEvents.length > 0;
        passed = observed === Boolean(assertion.expected);
        evidenceStr = `Found ${matchingEvents.length} event(s) of type '${assertion.target}'`;
        break;
      }

      case "ARTIFACT_EXISTS": {
        const found = evidence.artifacts.find((a) => a.path === assertion.target || a.id === assertion.target);
        observed = found !== undefined;
        passed = observed === Boolean(assertion.expected);
        evidenceStr = found
          ? `Artifact '${assertion.target}' found (hash: ${found.hash ?? "none"})`
          : `Artifact '${assertion.target}' not found`;
        break;
      }

      case "POLICY_DECISION": {
        observed = evidence.policyDecisions[evidence.policyDecisions.length - 1] ?? "NONE";
        passed = observed === assertion.expected;
        evidenceStr = `Observed policy decision: '${String(observed)}' (expected: '${String(assertion.expected)}')`;
        break;
      }

      case "TOOL_COUNT_LIMIT": {
        const toolEvents = evidence.events.filter((e) => e.type.includes("tool"));
        const limit = Number(assertion.expected);
        observed = toolEvents.length;
        passed = toolEvents.length <= limit;
        evidenceStr = `Observed ${toolEvents.length} tool call(s) (limit: ${limit})`;
        break;
      }

      case "RESOURCE_LIMIT": {
        const metricVal = evidence.metrics[assertion.target] ?? 0;
        const limit = Number(assertion.expected);
        observed = metricVal;
        passed = metricVal <= limit;
        evidenceStr = `Observed metric '${assertion.target}' = ${metricVal} (limit: ${limit})`;
        break;
      }

      case "SECRET_ABSENT": {
        const sensitiveRegex = /(sk-[a-zA-Z0-9_\-]{20,}|Bearer\s+[a-zA-Z0-9_\-\.]{25,}|AKIA[0-9A-Z]{16})/i;
        let leaked = false;

        for (const ev of evidence.events) {
          const payloadStr = JSON.stringify(ev.payload ?? {});
          if (sensitiveRegex.test(payloadStr)) {
            leaked = true;
            break;
          }
        }
        for (const val of Object.values(evidence.stateSnapshots)) {
          if (sensitiveRegex.test(JSON.stringify(val))) {
            leaked = true;
            break;
          }
        }

        observed = !leaked;
        passed = observed === Boolean(assertion.expected);
        evidenceStr = leaked ? "Raw credential pattern detected in evidence" : "No raw credentials detected";
        break;
      }

      case "PROJECT_CONTAINMENT": {
        observed = evidence.stateSnapshots[assertion.target] ?? false;
        passed = observed === Boolean(assertion.expected);
        evidenceStr = `Project containment verified: ${String(observed)}`;
        break;
      }

      case "RECOVERY_SURVIVED": {
        observed = evidence.stateSnapshots[assertion.target] ?? false;
        passed = observed === Boolean(assertion.expected);
        evidenceStr = `Recovery state verification: ${String(observed)}`;
        break;
      }

      default:
        passed = false;
        evidenceStr = `Unknown assertion type '${assertion.type}'`;
    }

    return AssertionEvaluationResultSchema.parse({
      assertionId: assertion.id,
      passed,
      expected: assertion.expected,
      observed,
      evidence: evidenceStr,
      criticality: assertion.criticality,
    });
  }
}
