import { describe, it, expect } from "vitest";
import { DAGEngine } from "../../src/workflow/dag-engine.js";
import { defineWorkflow, task } from "../../src/workflow/workflow-dsl.js";

describe("P7.1 DAG Engine — Topological Levels & Execution Wave Partitioning", () => {
  const dagEngine = new DAGEngine();

  it("partitions linear workflow into sequential single-node levels", () => {
    const wf = defineWorkflow({
      name: "linear-wf",
      tasks: [
        task("step1", { agentId: "agent_1" }),
        task("step2", { agentId: "agent_2", dependsOn: ["step1"] }),
        task("step3", { agentId: "agent_3", dependsOn: ["step2"] }),
      ],
    });

    const dag = dagEngine.buildDAG(wf);
    expect(dag.hasCycles).toBe(false);
    expect(dag.levels).toEqual([["step1"], ["step2"], ["step3"]]);
  });

  it("partitions diamond workflow into parallel execution waves", () => {
    const wf = defineWorkflow({
      name: "diamond-wf",
      tasks: [
        task("init", { agentId: "agent_0" }),
        task("parallel_a", { agentId: "agent_a", dependsOn: ["init"] }),
        task("parallel_b", { agentId: "agent_b", dependsOn: ["init"] }),
        task("parallel_c", { agentId: "agent_c", dependsOn: ["init"] }),
        task("aggregate", {
          agentId: "agent_agg",
          dependsOn: ["parallel_a", "parallel_b", "parallel_c"],
        }),
      ],
    });

    const dag = dagEngine.buildDAG(wf);
    expect(dag.hasCycles).toBe(false);
    expect(dag.levels).toHaveLength(3);
    expect(dag.levels[0]).toEqual(["init"]);
    expect(dag.levels[1]?.sort()).toEqual(["parallel_a", "parallel_b", "parallel_c"].sort());
    expect(dag.levels[2]).toEqual(["aggregate"]);
  });

  it("correctly resolves transitive upstream prerequisites", () => {
    const wf = defineWorkflow({
      name: "transitive-wf",
      tasks: [
        task("A", { agentId: "agent_1" }),
        task("B", { agentId: "agent_2", dependsOn: ["A"] }),
        task("C", { agentId: "agent_3", dependsOn: ["B"] }),
        task("D", { agentId: "agent_4", dependsOn: ["C"] }),
      ],
    });

    const dag = dagEngine.buildDAG(wf);
    const prereqsD = dagEngine.getUpstreamPrerequisites("D", dag);
    expect(prereqsD.sort()).toEqual(["A", "B", "C"].sort());

    const prereqsB = dagEngine.getUpstreamPrerequisites("B", dag);
    expect(prereqsB).toEqual(["A"]);
  });

  it("correctly resolves transitive downstream dependents", () => {
    const wf = defineWorkflow({
      name: "dependents-wf",
      tasks: [
        task("root", { agentId: "agent_1" }),
        task("left", { agentId: "agent_2", dependsOn: ["root"] }),
        task("right", { agentId: "agent_3", dependsOn: ["root"] }),
        task("leaf", { agentId: "agent_4", dependsOn: ["left", "right"] }),
      ],
    });

    const dag = dagEngine.buildDAG(wf);
    const dependentsRoot = dagEngine.getDownstreamDependents("root", dag);
    expect(dependentsRoot.sort()).toEqual(["left", "right", "leaf"].sort());

    const dependentsLeft = dagEngine.getDownstreamDependents("left", dag);
    expect(dependentsLeft).toEqual(["leaf"]);
  });
});
