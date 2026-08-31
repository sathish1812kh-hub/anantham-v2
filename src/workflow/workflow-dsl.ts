import { randomUUID } from "node:crypto";
import {
  type WorkflowDefinition,
  WorkflowDefinitionSchema,
  type WorkflowTaskNode,
  WorkflowTaskNodeSchema,
  type WorkflowParallelNode,
  WorkflowParallelNodeSchema,
  type WorkflowForeachNode,
  WorkflowForeachNodeSchema,
  type WorkflowVerifyNode,
  WorkflowVerifyNodeSchema,
  type WorkflowApproveNode,
  WorkflowApproveNodeSchema,
  type WorkflowCondition,
  type WorkflowNode,
  type WorkflowScope,
} from "../domain/workflow.js";

export interface DefineWorkflowInput {
  id?: string;
  projectId?: string;
  name: string;
  version?: string;
  scope?: WorkflowScope;
  description?: string;
  concurrency?: {
    maxAgents?: number;
    maxParallelTasks?: number;
  };
  budget?: {
    maxTokens?: number;
    maxCostUsd?: number;
    maxDurationMs?: number;
  };
  tasks: WorkflowNode[];
  verify?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Fluent builder for creating type-safe workflow definitions.
 * PRD Part 2 Section 109 & 110.
 */
export function defineWorkflow(input: DefineWorkflowInput): WorkflowDefinition {
  const now = new Date().toISOString();
  const raw: WorkflowDefinition = {
    id: input.id || randomUUID(),
    projectId: input.projectId,
    name: input.name,
    version: input.version || "1.0.0",
    scope: input.scope || "project",
    description: input.description,
    status: "ACTIVE",
    concurrency: {
      maxAgents: input.concurrency?.maxAgents ?? 4,
      maxParallelTasks: input.concurrency?.maxParallelTasks ?? 8,
    },
    budget: input.budget,
    tasks: input.tasks,
    verify: input.verify ?? [],
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  return WorkflowDefinitionSchema.parse(raw);
}

/**
 * Fluent builder for single task node.
 */
export function task(
  id: string,
  options: {
    agentId: string;
    title?: string;
    description?: string;
    modelProfile?: string;
    dependsOn?: string[];
    condition?: WorkflowCondition;
    timeoutMs?: number;
    maxRetries?: number;
    budgetTokens?: number;
    inputs?: Record<string, unknown>;
    outputs?: string[];
    requiredCapabilities?: string[];
    targetFiles?: string[];
    readOnlyFiles?: string[];
  }
): WorkflowTaskNode {
  return WorkflowTaskNodeSchema.parse({
    kind: "task",
    id,
    agentId: options.agentId,
    title: options.title,
    description: options.description,
    modelProfile: options.modelProfile,
    dependsOn: options.dependsOn ?? [],
    condition: options.condition,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries ?? 3,
    budgetTokens: options.budgetTokens,
    inputs: options.inputs ?? {},
    outputs: options.outputs ?? [],
    requiredCapabilities: options.requiredCapabilities ?? [],
    targetFiles: options.targetFiles ?? [],
    readOnlyFiles: options.readOnlyFiles ?? [],
  });
}

/**
 * Fluent builder for parallel tasks node.
 */
export function parallel(
  id: string,
  tasks: WorkflowTaskNode[],
  options?: {
    maxConcurrency?: number;
    dependsOn?: string[];
  }
): WorkflowParallelNode {
  return WorkflowParallelNodeSchema.parse({
    kind: "parallel",
    id,
    tasks,
    maxConcurrency: options?.maxConcurrency,
    dependsOn: options?.dependsOn ?? [],
  });
}

/**
 * Fluent builder for foreach iteration node.
 */
export function foreach(
  id: string,
  collection: string,
  iteratorVariable: string,
  taskNode: WorkflowTaskNode,
  options?: {
    maxConcurrency?: number;
    dependsOn?: string[];
  }
): WorkflowForeachNode {
  return WorkflowForeachNodeSchema.parse({
    kind: "foreach",
    id,
    collection,
    iteratorVariable,
    task: taskNode,
    maxConcurrency: options?.maxConcurrency,
    dependsOn: options?.dependsOn ?? [],
  });
}

/**
 * Fluent builder for automated verification node.
 */
export function verify(
  id: string,
  assertions: string[],
  options?: {
    dependsOn?: string[];
  }
): WorkflowVerifyNode {
  return WorkflowVerifyNodeSchema.parse({
    kind: "verify",
    id,
    assertions,
    dependsOn: options?.dependsOn ?? [],
  });
}

/**
 * Fluent builder for human-in-the-loop approval gate node.
 */
export function approve(
  id: string,
  message: string,
  options?: {
    requiredRole?: string;
    timeoutMs?: number;
    dependsOn?: string[];
  }
): WorkflowApproveNode {
  return WorkflowApproveNodeSchema.parse({
    kind: "approve",
    id,
    message,
    requiredRole: options?.requiredRole,
    timeoutMs: options?.timeoutMs,
    dependsOn: options?.dependsOn ?? [],
  });
}
