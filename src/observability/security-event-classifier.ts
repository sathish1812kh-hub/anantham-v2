import { type SecurityEventClassification } from "../domain/observability.js";
import { type HarnessEvent } from "../domain/event.js";

/**
 * Deterministic Security Event Classifier.
 * PRD Part 3 Section 85.
 */
export class SecurityEventClassifier {
  /**
   * Classify an authoritative runtime event or decision into a standard security classification.
   */
  public static classify(
    event: Partial<HarnessEvent>,
    decision?: string,
    errorMsg?: string
  ): SecurityEventClassification {
    const error = (errorMsg ?? "").toLowerCase();
    const type = (event.type ?? "").toLowerCase();

    // 1. Prompt Injection & Adversarial Input
    if (
      error.includes("prompt injection") ||
      error.includes("jailbreak") ||
      error.includes("system prompt override")
    ) {
      return "PROMPT_INJECTION";
    }

    // 2. Secret & Credential Leakage Detection
    if (
      error.includes("secret detected") ||
      error.includes("credential leakage") ||
      error.includes("raw api key")
    ) {
      return "SECRET_DETECTION";
    }

    // 3. Project Tenant Isolation Violations
    if (
      error.includes("cross-project") ||
      error.includes("tenant boundary") ||
      error.includes("forbidden: access to project")
    ) {
      return "PROJECT_ISOLATION_VIOLATION";
    }

    // 4. Webhook & Signature Failures
    if (
      error.includes("signature") ||
      error.includes("invalid cryptographic webhook signature")
    ) {
      return "SIGNATURE_FAILURE";
    }

    if (error.includes("duplicate webhook") || error.includes("replay")) {
      return "REPLAY_ATTEMPT";
    }

    // 5. Authentication Failures
    if (
      error.includes("unauthorized") ||
      error.includes("invalid token") ||
      error.includes("missing authentication")
    ) {
      return "AUTHENTICATION_FAILURE";
    }

    // 6. Policy & Tool Denials
    if (decision === "DENY" || type === "tool.denied") {
      if (error.includes("permission escalation") || error.includes("trust level")) {
        return "PERMISSION_ESCALATION_ATTEMPT";
      }
      if (type.includes("tool")) {
        return "TOOL_DENIED";
      }
      return "POLICY_DENIED";
    }

    // 7. Fencing & Recovery Failures
    if (error.includes("fencing") || error.includes("generation token mismatch")) {
      return "FENCING_VIOLATION";
    }

    if (error.includes("recovery failure") || error.includes("integrity check failed")) {
      return "INTEGRITY_FAILURE";
    }

    if (error.includes("resource limit") || error.includes("budget exceeded")) {
      return "RESOURCE_LIMIT";
    }

    return "INFORMATIONAL";
  }
}
