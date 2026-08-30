import type { RiskLevel } from "../domain/policy.js";

export interface OperationContext {
  type: string;
  toolName?: string;
  resource?: string;
  arguments?: Record<string, unknown>;
  targetProjectId?: string;
  sourceProjectId?: string;
}

export class RiskClassifier {
  private static readonly CRITICAL_TOOLS = new Set([
    "export_credentials",
    "delete_project",
    "exec_binary",
    "format_disk",
    "manage_secret",
    "system_shutdown",
  ]);

  private static readonly HIGH_RISK_TOOLS = new Set([
    "run_command",
    "execute_shell",
    "bash",
    "terminal",
    "http_request",
    "fetch_url",
    "delete_file",
    "delete_artifact",
    "modify_config",
  ]);

  private static readonly MEDIUM_RISK_TOOLS = new Set([
    "write_to_file",
    "replace_file_content",
    "create_artifact",
    "save_memory",
    "invoke_model",
    "fork_session",
  ]);

  private static readonly LOW_RISK_TOOLS = new Set([
    "read_file",
    "view_file",
    "list_dir",
    "grep_search",
    "find_by_name",
    "search_memory",
    "read_artifact",
    "inspect_context",
  ]);

  /**
   * Deterministically classifies an operation into a RiskLevel.
   * PRD Part 1 Section 34 & PRD Part 3 Section 146.
   */
  public static classify(operation: OperationContext): RiskLevel {
    // 1. Cross-project access attempt is always CRITICAL
    if (
      operation.targetProjectId &&
      operation.sourceProjectId &&
      operation.targetProjectId !== operation.sourceProjectId
    ) {
      return "critical";
    }

    const toolName = (operation.toolName || operation.type || "").toLowerCase().trim();
    const opType = (operation.type || "").toLowerCase().trim();

    // 2. Critical tools & credential manipulation
    if (
      this.CRITICAL_TOOLS.has(toolName) ||
      toolName.includes("credential") ||
      toolName.includes("secret") ||
      opType.includes("credential") ||
      opType.includes("secret")
    ) {
      return "critical";
    }

    // Inspect command arguments for dangerous destructive commands
    if (operation.arguments) {
      const argsStr = JSON.stringify(operation.arguments).toLowerCase();
      if (
        argsStr.includes("rm -rf") ||
        argsStr.includes("format ") ||
        argsStr.includes("drop table") ||
        argsStr.includes("eval(")
      ) {
        return "critical";
      }
    }

    // 3. High risk: shell / network / file deletion
    if (
      this.HIGH_RISK_TOOLS.has(toolName) ||
      toolName.includes("shell") ||
      toolName.includes("exec") ||
      toolName.includes("network") ||
      toolName.includes("delete") ||
      opType.includes("delete")
    ) {
      return "high";
    }

    // 4. Low risk: pure reads / search / inspection
    if (
      this.LOW_RISK_TOOLS.has(toolName) ||
      toolName.startsWith("read_") ||
      toolName.startsWith("view_") ||
      toolName.startsWith("list_") ||
      toolName.startsWith("search_") ||
      opType === "read" ||
      opType === "inspect" ||
      opType === "query"
    ) {
      return "low";
    }

    // 5. Medium risk: file writes / artifact mutations / model execution
    if (
      this.MEDIUM_RISK_TOOLS.has(toolName) ||
      toolName.startsWith("write_") ||
      toolName.startsWith("create_") ||
      opType === "write" ||
      opType === "mutate"
    ) {
      return "medium";
    }

    // Default safe tier
    return "medium";
  }
}
