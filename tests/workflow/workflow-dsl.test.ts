import { describe, it, expect } from "vitest";
import {
  defineWorkflow,
  task,
  parallel,
  foreach,
  verify,
  approve,
} from "../../src/workflow/workflow-dsl.js";

describe("P7.1 Workflow DSL — Fluent Primitives & Builder API", () => {
  it("builds a simple linear workflow with task primitives", () => {
    const wf = defineWorkflow({
      name: "linear-build",
      version: "1.0.0",
      tasks: [
        task("lint", { agentId: "agent_linter" }),
        task("test", { agentId: "agent_tester", dependsOn: ["lint"] }),
        task("build", { agentId: "agent_builder", dependsOn: ["test"] }),
      ],
      verify: ["build.success"],
    });

    expect(wf.name).toBe("linear-build");
    expect(wf.version).toBe("1.0.0");
    expect(wf.tasks).toHaveLength(3);
    expect(wf.tasks[1]?.dependsOn).toEqual(["lint"]);
    expect(wf.tasks[2]?.dependsOn).toEqual(["test"]);
    expect(wf.concurrency.maxAgents).toBe(4);
  });

  it("builds a complex workflow with parallel, foreach, approve, and verify nodes", () => {
    const wf = defineWorkflow({
      name: "full-featured-pipeline",
      version: "2.1.0",
      scope: "project",
      projectId: "proj_anantham",
      concurrency: {
        maxAgents: 8,
        maxParallelTasks: 16,
      },
      budget: {
        maxTokens: 100000,
        maxCostUsd: 5.0,
      },
      tasks: [
        task("setup", { agentId: "agent_infra" }),
        parallel("analyze_and_test", [
          task("unit_tests", { agentId: "agent_tester" }),
          task("security_scan", { agentId: "agent_security" }),
        ], { dependsOn: ["setup"] }),
        foreach(
          "process_modules",
          "modules",
          "module",
          task("compile_module", { agentId: "agent_compiler" }),
          { maxConcurrency: 4, dependsOn: ["analyze_and_test"] }
        ),
        approve("qa_approval", "Approve release deployment to production", {
          requiredRole: "qa_lead",
          timeoutMs: 120000,
          dependsOn: ["process_modules"],
        }),
        verify("final_verification", ["system.health == true", "smoke_tests.pass == true"], {
          dependsOn: ["qa_approval"],
        }),
      ],
    });

    expect(wf.name).toBe("full-featured-pipeline");
    expect(wf.tasks).toHaveLength(5);
    expect(wf.tasks[0]?.kind).toBe("task");
    expect(wf.tasks[1]?.kind).toBe("parallel");
    expect(wf.tasks[2]?.kind).toBe("foreach");
    expect(wf.tasks[3]?.kind).toBe("approve");
    expect(wf.tasks[4]?.kind).toBe("verify");
    expect(wf.concurrency.maxAgents).toBe(8);
  });

  it("supports condition blocks inside task definitions", () => {
    const t = task("deploy_prod", {
      agentId: "agent_deployer",
      condition: {
        type: "expression",
        expression: 'variables.branch == "main" && tasks.tests.pass == true',
      },
      dependsOn: ["tests"],
    });

    expect(t.condition).toBeDefined();
    expect(t.condition?.type).toBe("expression");
    expect(t.condition?.expression).toContain("branch == \"main\"");
  });
});
