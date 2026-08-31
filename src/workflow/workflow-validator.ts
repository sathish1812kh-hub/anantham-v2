import {
  type WorkflowDefinition,
  WorkflowDefinitionSchema,
} from "../domain/workflow.js";
import { DAGEngine, type DAGValidationResult } from "./dag-engine.js";

export interface WorkflowValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  dagValidation?: DAGValidationResult;
}

/**
 * Deep Workflow Validator & Security Guard.
 * Enforces structural schema integrity, cycle elimination, path security,
 * and trust boundary constraints.
 * PRD Part 2 Section 109, 115, 116.
 */
export class WorkflowValidator {
  private readonly dagEngine: DAGEngine;

  constructor(dagEngine?: DAGEngine) {
    this.dagEngine = dagEngine ?? new DAGEngine();
  }

  /**
   * Validate a WorkflowDefinition completely.
   */
  public validate(workflow: unknown): WorkflowValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Zod Schema Validation
    const parsed = WorkflowDefinitionSchema.safeParse(workflow);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`[Schema] ${issue.path.join(".")}: ${issue.message}`);
      }
      return { valid: false, errors, warnings };
    }

    const def: WorkflowDefinition = parsed.data;

    // 2. DAG & Cycle Validation
    const dagRes = this.dagEngine.validateDAG(def);
    if (!dagRes.valid) {
      errors.push(...dagRes.errors);
    }

    // 3. Node-Level Structural & Security Verification
    const seenNodeIds = new Set<string>();

    for (const node of def.tasks) {
      if (seenNodeIds.has(node.id)) {
        errors.push(`Duplicate node ID "${node.id}".`);
      }
      seenNodeIds.add(node.id);

      switch (node.kind) {
        case "task": {
          // Path traversal security check
          for (const file of [...node.targetFiles, ...node.readOnlyFiles]) {
            if (file.includes("..") || file.startsWith("/") || /^[a-zA-Z]:\\/.test(file)) {
              errors.push(
                `Security violation: Task "${node.id}" contains unsafe absolute or path traversal path "${file}".`
              );
            }
          }
          break;
        }

        case "parallel": {
          if (node.tasks.length === 0) {
            errors.push(`Parallel node "${node.id}" must contain at least one task.`);
          }
          const parallelIds = new Set<string>();
          for (const t of node.tasks) {
            if (parallelIds.has(t.id)) {
              errors.push(
                `Duplicate sub-task ID "${t.id}" inside parallel node "${node.id}".`
              );
            }
            parallelIds.add(t.id);
          }
          break;
        }

        case "foreach": {
          if (!node.collection || node.collection.trim() === "") {
            errors.push(`Foreach node "${node.id}" must specify a collection.`);
          }
          if (!node.iteratorVariable || node.iteratorVariable.trim() === "") {
            errors.push(`Foreach node "${node.id}" must specify an iterator variable.`);
          }
          break;
        }

        case "verify": {
          if (node.assertions.length === 0) {
            errors.push(`Verify node "${node.id}" must contain at least one assertion.`);
          }
          break;
        }

        case "approve": {
          if (!node.message || node.message.trim() === "") {
            errors.push(`Approve node "${node.id}" must specify an approval message.`);
          }
          break;
        }
      }
    }

    // 4. Budget & Concurrency Sanity Checks
    if (def.concurrency.maxAgents <= 0) {
      errors.push(`concurrency.maxAgents must be greater than 0.`);
    }
    if (def.concurrency.maxParallelTasks <= 0) {
      errors.push(`concurrency.maxParallelTasks must be greater than 0.`);
    }

    if (def.budget) {
      if (def.budget.maxTokens && def.budget.maxTokens <= 0) {
        errors.push(`budget.maxTokens must be positive.`);
      }
      if (def.budget.maxCostUsd && def.budget.maxCostUsd <= 0) {
        errors.push(`budget.maxCostUsd must be positive.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      dagValidation: dagRes,
    };
  }
}
