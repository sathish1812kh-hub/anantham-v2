import { describe, it, expect } from "vitest";
import {
  WorkflowDefinitionSchema,
  WorkflowTaskNodeSchema,
  WorkflowParallelNodeSchema,
  WorkflowForeachNodeSchema,
  WorkflowVerifyNodeSchema,
  WorkflowApproveNodeSchema,
  WorkflowRunSchema,
  WorkflowScopeSchema,
} from "../../src/domain/workflow.js";

describe("P7.1 Workflow Contracts — Zod Schema & Domain Model Validation", () => {
  it("validates valid task node schema", () => {
    const task = {
      kind: "task",
      id: "node_01",
      agentId: "agent_dev",
      title: "Build Feature",
      description: "Implement core algorithm",
      dependsOn: [],
      maxRetries: 2,
      budgetTokens: 5000,
      inputs: { key: "value" },
      outputs: ["artifact_out"],
      requiredCapabilities: ["typescript"],
      targetFiles: ["src/feature.ts"],
      readOnlyFiles: ["src/types.ts"],
    };

    const parsed = WorkflowTaskNodeSchema.parse(task);
    expect(parsed.id).toBe("node_01");
    expect(parsed.agentId).toBe("agent_dev");
    expect(parsed.kind).toBe("task");
  });

  it("validates parallel node schema", () => {
    const parallelNode = {
      kind: "parallel",
      id: "parallel_01",
      tasks: [
        {
          kind: "task",
          id: "task_a",
          agentId: "agent_a",
          dependsOn: [],
          maxRetries: 1,
          inputs: {},
          outputs: [],
          requiredCapabilities: [],
          targetFiles: [],
          readOnlyFiles: [],
        },
        {
          kind: "task",
          id: "task_b",
          agentId: "agent_b",
          dependsOn: [],
          maxRetries: 1,
          inputs: {},
          outputs: [],
          requiredCapabilities: [],
          targetFiles: [],
          readOnlyFiles: [],
        },
      ],
      maxConcurrency: 2,
      dependsOn: ["node_01"],
    };

    const parsed = WorkflowParallelNodeSchema.parse(parallelNode);
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.maxConcurrency).toBe(2);
  });

  it("validates foreach node schema", () => {
    const foreachNode = {
      kind: "foreach",
      id: "foreach_01",
      collection: "artifacts",
      iteratorVariable: "artifact",
      task: {
        kind: "task",
        id: "process_artifact",
        agentId: "agent_processor",
        dependsOn: [],
        maxRetries: 1,
        inputs: {},
        outputs: [],
        requiredCapabilities: [],
        targetFiles: [],
        readOnlyFiles: [],
      },
      maxConcurrency: 4,
      dependsOn: [],
    };

    const parsed = WorkflowForeachNodeSchema.parse(foreachNode);
    expect(parsed.collection).toBe("artifacts");
    expect(parsed.iteratorVariable).toBe("artifact");
  });

  it("validates verify and approve node schemas", () => {
    const verifyNode = {
      kind: "verify",
      id: "verify_01",
      assertions: ["tests.pass", "lint.clean"],
      dependsOn: ["task_a"],
    };
    const parsedVerify = WorkflowVerifyNodeSchema.parse(verifyNode);
    expect(parsedVerify.assertions).toContain("tests.pass");

    const approveNode = {
      kind: "approve",
      id: "approve_01",
      message: "Please approve deployment to production",
      requiredRole: "lead_engineer",
      timeoutMs: 60000,
      dependsOn: ["verify_01"],
    };
    const parsedApprove = WorkflowApproveNodeSchema.parse(approveNode);
    expect(parsedApprove.requiredRole).toBe("lead_engineer");
  });

  it("validates complete workflow definition schema", () => {
    const workflow = {
      id: "wf_test_01",
      projectId: "proj_01",
      name: "release-pipeline",
      version: "1.0.0",
      scope: "project",
      status: "ACTIVE",
      concurrency: { maxAgents: 4, maxParallelTasks: 8 },
      budget: { maxTokens: 50000, maxCostUsd: 1.5 },
      tasks: [
        {
          kind: "task",
          id: "task_test",
          agentId: "agent_tester",
          dependsOn: [],
          maxRetries: 2,
          inputs: {},
          outputs: [],
          requiredCapabilities: [],
          targetFiles: [],
          readOnlyFiles: [],
        },
      ],
      verify: ["tests.pass"],
      metadata: { env: "staging" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = WorkflowDefinitionSchema.parse(workflow);
    expect(parsed.name).toBe("release-pipeline");
    expect(parsed.version).toBe("1.0.0");
  });

  it("validates workflow run schema with pinned versions", () => {
    const run = {
      id: "run_01",
      workflowId: "wf_test_01",
      projectId: "proj_01",
      sessionId: "sess_01",
      status: "RUNNING",
      currentStepIndex: 1,
      completedTasks: ["task_test"],
      failedTasks: [],
      runningTasks: ["task_deploy"],
      taskResults: { task_test: { passed: true } },
      pinnedVersions: {
        workflowVersion: "1.0.0",
        pluginVersions: { "plugin-git": "1.2.0" },
        skillVersions: { "skill-review": "2.0.0" },
        agentVersions: { "agent-tester": "1.0.0" },
        modelProfile: "claude-3-5-sonnet",
      },
      startedAt: new Date().toISOString(),
    };

    const parsed = WorkflowRunSchema.parse(run);
    expect(parsed.pinnedVersions.workflowVersion).toBe("1.0.0");
    expect(parsed.pinnedVersions.pluginVersions["plugin-git"]).toBe("1.2.0");
    expect(parsed.status).toBe("RUNNING");
  });

  it("validates scope hierarchy constants", () => {
    expect(WorkflowScopeSchema.options).toEqual(["built-in", "global", "profile", "project"]);
  });
});
