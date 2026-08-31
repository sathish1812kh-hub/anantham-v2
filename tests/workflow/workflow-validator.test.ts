import { describe, it, expect } from "vitest";
import { WorkflowValidator } from "../../src/workflow/workflow-validator.js";
import { defineWorkflow, task, parallel, foreach, verify, approve } from "../../src/workflow/workflow-dsl.js";

describe("P7.1 Workflow Validator — Deep Validation & Security Checks", () => {
  const validator = new WorkflowValidator();

  it("passes validation for a clean, well-formed workflow", () => {
    const wf = defineWorkflow({
      name: "valid-wf",
      version: "1.0.0",
      tasks: [
        task("step1", { agentId: "agent_1" }),
        task("step2", { agentId: "agent_2", dependsOn: ["step1"] }),
        verify("check", ["step2.status == 'completed'"], { dependsOn: ["step2"] }),
      ],
    });

    const report = validator.validate(wf);
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it("detects path traversal attempts in targetFiles or readOnlyFiles", () => {
    const wf = defineWorkflow({
      name: "malicious-path-wf",
      tasks: [
        task("bad_task", {
          agentId: "agent_dev",
          targetFiles: ["../../etc/passwd"],
        }),
      ],
    });

    const report = validator.validate(wf);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes("Security violation") && e.includes("path traversal"))).toBe(true);
  });

  it("detects empty parallel node tasks", () => {
    const wf = defineWorkflow({
      name: "empty-parallel-wf",
      tasks: [
        task("init", { agentId: "agent_1" }),
      ],
    });
    // Manually push malformed node to test raw validation
    (wf.tasks as any).push({
      kind: "parallel",
      id: "empty_parallel",
      tasks: [],
      dependsOn: ["init"],
    });

    const report = validator.validate(wf);
    expect(report.valid).toBe(false);
  });

  it("detects missing collection in foreach node", () => {
    const rawWf = {
      id: "wf_bad_fe",
      name: "empty-foreach-wf",
      version: "1.0.0",
      scope: "project",
      status: "ACTIVE",
      concurrency: { maxAgents: 4, maxParallelTasks: 8 },
      tasks: [
        {
          kind: "foreach",
          id: "fe_1",
          collection: "",
          iteratorVariable: "item",
          task: {
            kind: "task",
            id: "sub",
            agentId: "agent_1",
            dependsOn: [],
            maxRetries: 3,
            inputs: {},
            outputs: [],
            requiredCapabilities: [],
            targetFiles: [],
            readOnlyFiles: [],
          },
          dependsOn: [],
        },
      ],
      verify: [],
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const report = validator.validate(rawWf);
    expect(report.valid).toBe(false);
  });

  it("detects empty assertions in verify node", () => {
    const wf = defineWorkflow({
      name: "empty-verify-wf",
      tasks: [
        task("init", { agentId: "agent_1" }),
      ],
    });
    (wf.tasks as any).push({
      kind: "verify",
      id: "v_empty",
      assertions: [],
      dependsOn: [],
    });

    const report = validator.validate(wf);
    expect(report.valid).toBe(false);
  });
});
