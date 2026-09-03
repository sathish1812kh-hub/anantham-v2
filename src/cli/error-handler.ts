import { z } from "zod";
import { type CommandExecutionResult, CommandExecutionResultSchema } from "../domain/cli.js";

/**
 * CLI Error Handler preserving runtime error classification.
 * PRD Part 1 Section 60 & PRD Part 2 Section 170.
 */
export class CliErrorHandler {
  /**
   * Format an error into a structured CommandExecutionResult.
   */
  public handleError(commandName: string, error: unknown): CommandExecutionResult {
    let errorMsg: string;

    if (error instanceof z.ZodError) {
      const messages = error.issues.map((issue) => {
        const field = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        if (issue.code === "invalid_union" && Array.isArray((issue as unknown as { unionErrors?: z.ZodError[] }).unionErrors)) {
          const branchMessages = (issue as unknown as { unionErrors: z.ZodError[] }).unionErrors
            .flatMap((subErr) => (subErr.issues ?? []).map((subIssue) => subIssue.message))
            .filter(Boolean);
          if (branchMessages.length > 0) {
            return `${field}Invalid input: ${branchMessages.join(" OR ")}`;
          }
        }
        return `${field}${issue.message}`;
      });
      errorMsg = `Command validation failed: ${messages.join("; ")}`;
    } else if (error instanceof Error) {
      errorMsg = error.message;
    } else {
      errorMsg = String(error);
    }

    // Convert raw Zod JSON error arrays/objects to single-line human-readable messages if passed as string
    if (typeof errorMsg === "string" && errorMsg.includes('"code"') && errorMsg.includes('"message"')) {
      try {
        const jsonMatch = errorMsg.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const issues = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as { issues?: unknown[] }).issues)
              ? (parsed as { issues: unknown[] }).issues
              : [parsed];
          const parts = issues.map(
            (item: { path?: unknown[]; message?: string; code?: string; unionErrors?: Array<{ issues?: Array<{ message?: string }> }> }) => {
              const field = Array.isArray(item.path) && item.path.length > 0 ? `${item.path.join(".")}: ` : "";
              if (item.unionErrors && Array.isArray(item.unionErrors)) {
                const branchMessages = item.unionErrors
                  .flatMap((sub) => (sub.issues ?? []).map((si) => si.message))
                  .filter(Boolean);
                if (branchMessages.length > 0) {
                  return `${field}Invalid input: ${branchMessages.join(" OR ")}`;
                }
              }
              return `${field}${item.message ?? "Validation failed"}`;
            }
          );
          errorMsg = `Command validation failed: ${parts.join("; ")}`;
        }
      } catch {
        // Not parseable JSON, keep original string
      }
    }

    // Ensure error message is a clean, single-line string
    errorMsg = errorMsg.replace(/\r?\n\s*/g, " ").trim();

    const classification = this.classifyError(errorMsg);

    return CommandExecutionResultSchema.parse({
      success: false,
      commandName,
      error: errorMsg,
      classification,
      exitRequested: false,
    });
  }

  /**
   * Determine failure classification from error message.
   */
  public classifyError(errorMsg: string): string {
    const lower = errorMsg.toLowerCase();

    if (lower.includes("policy") || lower.includes("risk") || lower.includes("denied by policy")) {
      return "POLICY_DENIAL";
    }
    if (lower.includes("permission") || lower.includes("unauthorized") || lower.includes("forbidden")) {
      return "PERMISSION_DENIED";
    }
    if (lower.includes("invalid") || lower.includes("schema") || lower.includes("validation")) {
      return "VALIDATION_ERROR";
    }
    if (lower.includes("not found") || lower.includes("does not exist") || lower.includes("no active")) {
      return "NOT_FOUND";
    }
    if (lower.includes("fencing") || lower.includes("stale") || lower.includes("lease")) {
      return "LEASE_FENCING_ERROR";
    }
    if (lower.includes("sqlite") || lower.includes("database") || lower.includes("persist")) {
      return "PERSISTENCE_ERROR";
    }
    if (lower.includes("recovery") || lower.includes("orphan") || lower.includes("restore")) {
      return "RECOVERY_ERROR";
    }
    if (lower.includes("cancel") || lower.includes("abort")) {
      return "USER_CANCELLATION";
    }

    return "COMMAND_EXECUTION_ERROR";
  }
}
