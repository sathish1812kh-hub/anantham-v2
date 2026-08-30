import { describe, it, expect } from "vitest";
import { RiskClassifier } from "../../src/policy/risk-classifier.js";

describe("P4.1 Risk Classifier — Deterministic Operation Classification", () => {
  it("classifies pure read-only tools as LOW risk", () => {
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "read_file" })).toBe("low");
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "view_file" })).toBe("low");
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "grep_search" })).toBe("low");
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "inspect_context" })).toBe("low");
  });

  it("classifies file and memory writes as MEDIUM risk", () => {
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "write_to_file" })).toBe("medium");
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "replace_file_content" })).toBe("medium");
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "save_memory" })).toBe("medium");
  });

  it("classifies command execution and network calls as HIGH risk", () => {
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "run_command" })).toBe("high");
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "execute_shell" })).toBe("high");
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "http_request" })).toBe("high");
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "delete_file" })).toBe("high");
  });

  it("classifies credentials, destructive commands, and cross-project operations as CRITICAL risk", () => {
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "export_credentials" })).toBe("critical");
    expect(RiskClassifier.classify({ type: "tool_execution", toolName: "manage_secret" })).toBe("critical");
    expect(
      RiskClassifier.classify({
        type: "tool_execution",
        toolName: "run_command",
        arguments: { command: "rm -rf /" },
      })
    ).toBe("critical");
    expect(
      RiskClassifier.classify({
        type: "tool_execution",
        toolName: "read_file",
        sourceProjectId: "prj_alpha",
        targetProjectId: "prj_beta",
      })
    ).toBe("critical");
  });
});
