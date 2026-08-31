import { describe, it, expect } from "vitest";
import { DAGEngine } from "../../src/workflow/dag-engine.js";
import { defineWorkflow, task } from "../../src/workflow/workflow-dsl.js";

describe("P7.1 DAG Engine — Cycle Detection & Deadlock Prevention", () => {
  const dagEngine = new DAGEngine();

  it("detects 3-node direct cyclic dependency: A -> B -> C -> A", () => {
    const wf = defineWorkflow({
      name: "cyclic-workflow-3",
      tasks: [
        task("A", { agentId: "agent_1", dependsOn: ["C"] }),
        task("B", { agentId: "agent_2", dependsOn: ["A"] }),
        task("C", { agentId: "agent_3", dependsOn: ["B"] }),
      ],
    });

    const dag = dagEngine.buildDAG(wf);
    expect(dag.hasCycles).toBe(true);
    expect(dag.cycleNodes).toContain("A");
    expect(dag.cycleNodes).toContain("B");
    expect(dag.cycleNodes).toContain("C");
    expect(dag.levels).toEqual([]);

    const validation = dagEngine.validateDAG(wf);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain("Deadlock cycle detected");
  });

  it("detects self-dependency: A -> A", () => {
    const wf = defineWorkflow({
      name: "self-dependent-workflow",
      tasks: [
        task("A", { agentId: "agent_1", dependsOn: ["A"] }),
      ],
    });

    const validation = dagEngine.validateDAG(wf);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain("self-dependency");
  });

  it("detects missing / unknown dependency node references", () => {
    const wf = defineWorkflow({
      name: "broken-deps-workflow",
      tasks: [
        task("A", { agentId: "agent_1", dependsOn: ["non_existent_node"] }),
      ],
    });

    const validation = dagEngine.validateDAG(wf);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('depends on unknown node "non_existent_node"');
  });

  it("detects duplicate node IDs", () => {
    const wf = defineWorkflow({
      name: "duplicate-id-workflow",
      tasks: [
        task("A", { agentId: "agent_1" }),
        task("A", { agentId: "agent_2" }),
      ],
    });

    const validation = dagEngine.validateDAG(wf);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('Duplicate task/node ID "A"');
  });

  it("validates complex acyclic graph cleanly with zero cycle errors", () => {
    const wf = defineWorkflow({
      name: "clean-diamond-workflow",
      tasks: [
        task("start", { agentId: "agent_1" }),
        task("branch_left", { agentId: "agent_2", dependsOn: ["start"] }),
        task("branch_right", { agentId: "agent_3", dependsOn: ["start"] }),
        task("join", { agentId: "agent_4", dependsOn: ["branch_left", "branch_right"] }),
      ],
    });

    const validation = dagEngine.validateDAG(wf);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.dag?.hasCycles).toBe(false);
  });
});
