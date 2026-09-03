/**
 * Tool Execution Risk Classifier
 * PRD-EXEC-003: Tool Execution & Risk Classification
 */

import type { ExecutionRiskLevel, ToolExecutionRequest } from "./types.js";

export class ToolRiskClassifier {
  private static readonly DESTRUCTIVE_PATTERNS = [
    /\brm\s+(-rf|-fr|--recursive)\b/i,
    /\bdel\s+\/f\s+\/s\s+\/q\b/i,
    /\bformat\s+[a-z]:/i,
    /\bdd\s+if=/i,
    /\bmkfs\b/i,
    /\bdrop\s+database\b/i,
    /\bdrop\s+table\b/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bgit\s+clean\s+-fdx\b/i,
  ];

  private static readonly NETWORK_TOOLS = new Set([
    "read_url_content",
    "search_web",
    "fetch",
    "curl",
    "wget",
    "http_request",
  ]);

  private static readonly READ_TOOLS = new Set([
    "view_file",
    "list_dir",
    "grep_search",
    "find_by_name",
    "read_resource",
    "list_resources",
    "inspect_code",
    "codegraph_explore",
  ]);

  private static readonly WRITE_TOOLS = new Set([
    "write_to_file",
    "replace_file_content",
    "generate_image",
    "create_file",
    "edit_file",
  ]);

  public classifyRequest(request: ToolExecutionRequest): ExecutionRiskLevel {
    const tool = request.toolName.toLowerCase();

    // 1. Check for explicit destructive actions in arguments
    const cmd = this.extractCommandLine(request);
    if (cmd) {
      for (const pattern of ToolRiskClassifier.DESTRUCTIVE_PATTERNS) {
        if (pattern.test(cmd)) {
          return "destructive";
        }
      }
    }

    // 2. Check for network tools
    if (ToolRiskClassifier.NETWORK_TOOLS.has(tool)) {
      return "network";
    }

    // 3. Check for command execution
    if (tool === "run_command" || tool === "execute_command" || tool === "exec" || tool === "bash") {
      // Check if command is network or read-only
      if (cmd) {
        if (/\b(curl|wget|ping|ssh|scp|nc|telnet|ftp)\b/i.test(cmd)) {
          return "network";
        }
        if (/^(git\s+(status|log|diff|branch)|ls|dir|cat|type|echo|pwd|whoami)\b/i.test(cmd.trim())) {
          return "read";
        }
      }
      return "execute";
    }

    // 4. Check for write tools
    if (ToolRiskClassifier.WRITE_TOOLS.has(tool)) {
      return "write";
    }

    // 5. Check for read tools
    if (ToolRiskClassifier.READ_TOOLS.has(tool)) {
      return "read";
    }

    // Default to execute risk for unknown custom or MCP tools
    return "execute";
  }

  public requiresUserApproval(risk: ExecutionRiskLevel, maxAllowedWithoutApproval: ExecutionRiskLevel): boolean {
    const rank: Record<ExecutionRiskLevel, number> = {
      read: 1,
      write: 2,
      execute: 3,
      network: 4,
      destructive: 5,
    };

    return rank[risk] > rank[maxAllowedWithoutApproval];
  }

  private extractCommandLine(request: ToolExecutionRequest): string | null {
    if (typeof request.arguments.CommandLine === "string") {
      return request.arguments.CommandLine;
    }
    if (typeof request.arguments.command === "string") {
      return request.arguments.command;
    }
    if (typeof request.arguments.cmd === "string") {
      return request.arguments.cmd;
    }
    return null;
  }
}
