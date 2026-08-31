import {
  type WorkflowDefinition,
  type WorkflowDAG,
  type WorkflowNode,
  WorkflowDAGSchema,
} from "../domain/workflow.js";

export interface DAGValidationResult {
  valid: boolean;
  errors: string[];
  dag?: WorkflowDAG;
}

/**
 * Deterministic Workflow DAG Engine & Cycle Detector.
 * Computes topological execution plans, detects circular dependencies,
 * and partitions execution into parallel wave levels.
 * PRD Part 2 Section 116.
 */
export class DAGEngine {
  /**
   * Build a complete WorkflowDAG from a WorkflowDefinition.
   */
  public buildDAG(workflow: WorkflowDefinition): WorkflowDAG {
    const nodeMap = new Map<string, WorkflowNode>();
    const nodeIds: string[] = [];

    // 1. Collect all node IDs
    for (const node of workflow.tasks) {
      nodeMap.set(node.id, node);
      nodeIds.push(node.id);
    }

    const adjacencyList: Record<string, string[]> = {};
    const reverseAdjacency: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};

    for (const id of nodeIds) {
      adjacencyList[id] = [];
      reverseAdjacency[id] = [];
      inDegree[id] = 0;
    }

    // 2. Build Adjacency & Reverse Adjacency
    for (const node of workflow.tasks) {
      const deps = node.dependsOn || [];
      for (const depId of deps) {
        if (nodeMap.has(depId)) {
          adjacencyList[depId]!.push(node.id);
          reverseAdjacency[node.id]!.push(depId);
          inDegree[node.id] = (inDegree[node.id] || 0) + 1;
        }
      }
    }

    // 3. Kahn's Algorithm for Cycle Detection & Topological Level Partitioning
    const inDegreeCopy = { ...inDegree };
    const queue: string[] = [];
    const levels: string[][] = [];

    // Find initial zero in-degree nodes
    for (const id of nodeIds) {
      if (inDegreeCopy[id] === 0) {
        queue.push(id);
      }
    }

    let processedCount = 0;
    let currentWave = [...queue];

    while (currentWave.length > 0) {
      levels.push([...currentWave]);
      const nextWave: string[] = [];

      for (const nodeId of currentWave) {
        processedCount++;
        const neighbors = adjacencyList[nodeId] || [];
        for (const neighbor of neighbors) {
          inDegreeCopy[neighbor]!--;
          if (inDegreeCopy[neighbor] === 0) {
            nextWave.push(neighbor);
          }
        }
      }

      currentWave = nextWave;
    }

    const hasCycles = processedCount < nodeIds.length;
    let cycleNodes: string[] | undefined;

    if (hasCycles) {
      // Find all nodes that still have in-degree > 0
      cycleNodes = nodeIds.filter((id) => (inDegreeCopy[id] || 0) > 0);
    }

    return WorkflowDAGSchema.parse({
      workflowId: workflow.id,
      nodeIds,
      adjacencyList,
      reverseAdjacency,
      inDegree,
      levels: hasCycles ? [] : levels,
      hasCycles,
      cycleNodes,
    });
  }

  /**
   * Validate DAG structural integrity, dependency existence, and cycle absence.
   */
  public validateDAG(workflow: WorkflowDefinition): DAGValidationResult {
    const errors: string[] = [];
    const nodeIds = new Set<string>();

    // 1. Check duplicate IDs
    for (const node of workflow.tasks) {
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate task/node ID "${node.id}" found in workflow.`);
      }
      nodeIds.add(node.id);
    }

    // 2. Check dependency existence and self-dependencies
    for (const node of workflow.tasks) {
      for (const depId of node.dependsOn || []) {
        if (depId === node.id) {
          errors.push(`Node "${node.id}" has a self-dependency.`);
        } else if (!nodeIds.has(depId)) {
          errors.push(`Node "${node.id}" depends on unknown node "${depId}".`);
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // 3. Build DAG and check cycles
    const dag = this.buildDAG(workflow);
    if (dag.hasCycles) {
      const cycleList = dag.cycleNodes ? dag.cycleNodes.join(", ") : "unknown";
      errors.push(
        `Deadlock cycle detected in workflow DAG involving nodes: [${cycleList}].`
      );
      return { valid: false, errors, dag };
    }

    return { valid: true, errors: [], dag };
  }

  /**
   * Returns all transitive upstream prerequisites for a given node.
   */
  public getUpstreamPrerequisites(nodeId: string, dag: WorkflowDAG): string[] {
    const prerequisites = new Set<string>();
    const stack = [...(dag.reverseAdjacency[nodeId] || [])];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (!prerequisites.has(current)) {
        prerequisites.add(current);
        const parents = dag.reverseAdjacency[current] || [];
        for (const p of parents) {
          stack.push(p);
        }
      }
    }

    return Array.from(prerequisites);
  }

  /**
   * Returns all transitive downstream dependents of a given node.
   */
  public getDownstreamDependents(nodeId: string, dag: WorkflowDAG): string[] {
    const dependents = new Set<string>();
    const stack = [...(dag.adjacencyList[nodeId] || [])];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (!dependents.has(current)) {
        dependents.add(current);
        const children = dag.adjacencyList[current] || [];
        for (const c of children) {
          stack.push(c);
        }
      }
    }

    return Array.from(dependents);
  }
}
