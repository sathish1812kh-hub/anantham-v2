import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SqliteEngine } from "../../src/persistence/sqlite-engine.js";
import { MigrationEngine } from "../../src/persistence/migration-engine.js";
import { allMigrations } from "../../src/persistence/migrations/001_initial_core_schema.js";
import { WorkflowRepository } from "../../src/persistence/repositories/workflow-repository.js";
import { WorkflowRegistry } from "../../src/workflow/workflow-registry.js";
import { WorkflowValidator } from "../../src/workflow/workflow-validator.js";
import { ConditionEvaluator } from "../../src/workflow/condition-evaluator.js";
import { defineWorkflow, task } from "../../src/workflow/workflow-dsl.js";

describe("P7.1 Workflow Security & Adversarial Attacks", () => {
  let engine: SqliteEngine;
  let workflowRepo: WorkflowRepository;
  let registry: WorkflowRegistry;
  let validator: WorkflowValidator;
  let conditionEvaluator: ConditionEvaluator;

  beforeEach(() => {
    engine = new SqliteEngine({ path: ":memory:" });
    engine.open();
    const migrator = new MigrationEngine(engine);
    migrator.migrate();

    workflowRepo = new WorkflowRepository(engine);
    validator = new WorkflowValidator();
    registry = new WorkflowRegistry({ workflowRepo, validator });
    conditionEvaluator = new ConditionEvaluator();
  });

  afterEach(() => {
    engine.close();
  });

  it("blocks path traversal attacks in target files", () => {
    const maliciousWf = defineWorkflow({
      name: "path-traversal-attack",
      tasks: [
        task("steal_keys", {
          agentId: "agent_rogue",
          targetFiles: ["../../../../../../etc/shadow"],
        }),
      ],
    });

    const regRes = registry.register(maliciousWf);
    expect(regRes.success).toBe(false);
    expect(regRes.errorMessage).toContain("Security violation");
  });

  it("blocks absolute path references in task target/read-only files", () => {
    const maliciousWf = defineWorkflow({
      name: "absolute-path-attack",
      tasks: [
        task("read_root", {
          agentId: "agent_rogue",
          readOnlyFiles: ["/var/run/secrets"],
        }),
      ],
    });

    const regRes = registry.register(maliciousWf);
    expect(regRes.success).toBe(false);
    expect(regRes.errorMessage).toContain("Security violation");
  });

  it("rejects circular deadlock injection attacks during registration", () => {
    const maliciousWf = defineWorkflow({
      name: "deadlock-attack",
      tasks: [
        task("t1", { agentId: "agent_1", dependsOn: ["t2"] }),
        task("t2", { agentId: "agent_2", dependsOn: ["t1"] }),
      ],
    });

    const regRes = registry.register(maliciousWf);
    expect(regRes.success).toBe(false);
    expect(regRes.errorMessage).toContain("Deadlock cycle detected");
  });

  it("defends against prompt injection & prototype pollution attempts in condition expressions", () => {
    const maliciousExpressions = [
      "constructor.prototype.polluted = true",
      "__proto__.admin = true",
      "import('fs').then(f => f.readFileSync('/etc/passwd'))",
      "process.exit(1)",
      "eval('1+1')",
      "require('child_process').exec('rm -rf /')",
    ];

    for (const expr of maliciousExpressions) {
      const result = conditionEvaluator.evaluate(
        { type: "expression", expression: expr },
        { variables: { admin: false } }
      );
      expect(result).toBe(false);
    }
  });
});
