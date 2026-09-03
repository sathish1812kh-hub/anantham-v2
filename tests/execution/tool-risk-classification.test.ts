import { describe, it, expect } from "vitest";
import { ToolRiskClassifier } from "../../src/execution/risk-classifier.js";
import type { ToolExecutionRequest } from "../../src/execution/types.js";

describe("PRD-EXEC-003: Tool Execution & Risk Classification", () => {
  const classifier = new ToolRiskClassifier();

  const createReq = (toolName: string, args: Record<string, unknown> = {}): ToolExecutionRequest => ({
    id: "req_test",
    toolName,
    action: "Action test",
    arguments: args,
    sessionId: "sess_1",
    agentId: "agent_1",
    workspaceRoot: "/workspace",
  });

  it("classifies read, write, execute, network, and destructive commands accurately", () => {
    // Read
    expect(classifier.classifyRequest(createReq("view_file"))).toBe("read");
    expect(classifier.classifyRequest(createReq("list_dir"))).toBe("read");
    expect(classifier.classifyRequest(createReq("run_command", { CommandLine: "git status" }))).toBe("read");

    // Write
    expect(classifier.classifyRequest(createReq("write_to_file"))).toBe("write");
    expect(classifier.classifyRequest(createReq("replace_file_content"))).toBe("write");

    // Network
    expect(classifier.classifyRequest(createReq("read_url_content"))).toBe("network");
    expect(classifier.classifyRequest(createReq("search_web"))).toBe("network");
    expect(classifier.classifyRequest(createReq("run_command", { CommandLine: "curl https://api.com" }))).toBe(
      "network"
    );

    // Execute
    expect(classifier.classifyRequest(createReq("run_command", { CommandLine: "npm test" }))).toBe("execute");
    expect(classifier.classifyRequest(createReq("run_command", { CommandLine: "python train.py" }))).toBe("execute");

    // Destructive
    expect(classifier.classifyRequest(createReq("run_command", { CommandLine: "rm -rf /" }))).toBe("destructive");
    expect(classifier.classifyRequest(createReq("run_command", { CommandLine: "git reset --hard HEAD~1" }))).toBe(
      "destructive"
    );
    expect(classifier.classifyRequest(createReq("run_command", { CommandLine: "del /f /s /q C:\\" }))).toBe(
      "destructive"
    );
  });

  it("evaluates approval gates based on risk thresholds", () => {
    expect(classifier.requiresUserApproval("read", "read")).toBe(false);
    expect(classifier.requiresUserApproval("write", "read")).toBe(true);
    expect(classifier.requiresUserApproval("execute", "write")).toBe(true);
    expect(classifier.requiresUserApproval("network", "execute")).toBe(true);
    expect(classifier.requiresUserApproval("destructive", "network")).toBe(true);
  });
});
