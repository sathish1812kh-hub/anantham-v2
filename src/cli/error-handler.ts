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
    const errorMsg = error instanceof Error ? error.message : String(error);
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
