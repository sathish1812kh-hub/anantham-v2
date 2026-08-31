import { describe, it, expect } from "vitest";
import { ConditionEvaluator } from "../../src/workflow/condition-evaluator.js";

describe("P7.1 Condition Evaluator — Safe Deterministic Evaluation", () => {
  const evaluator = new ConditionEvaluator();

  it("evaluates artifact_exists condition", () => {
    const result1 = evaluator.evaluate(
      { type: "artifact_exists", artifactId: "art_bundle_01" },
      { artifacts: ["art_bundle_01", "art_spec_02"] }
    );
    expect(result1).toBe(true);

    const result2 = evaluator.evaluate(
      { type: "artifact_exists", artifactId: "art_missing" },
      { artifacts: ["art_bundle_01"] }
    );
    expect(result2).toBe(false);
  });

  it("evaluates task_status condition", () => {
    const resultCompleted = evaluator.evaluate(
      { type: "task_status", taskId: "task_test", expectedStatus: "completed" },
      { completedTasks: ["task_test"] }
    );
    expect(resultCompleted).toBe(true);

    const resultFailed = evaluator.evaluate(
      { type: "task_status", taskId: "task_build", expectedStatus: "failed" },
      { failedTasks: ["task_build"] }
    );
    expect(resultFailed).toBe(true);

    const resultNotFailed = evaluator.evaluate(
      { type: "task_status", taskId: "task_build", expectedStatus: "failed" },
      { failedTasks: [] }
    );
    expect(resultNotFailed).toBe(false);
  });

  it("evaluates boolean comparison expressions safely", () => {
    const context = {
      taskResults: {
        tests: { pass: true, exitCode: 0, testCount: 42 },
      },
      variables: {
        env: "production",
        retries: 3,
      },
    };

    expect(
      evaluator.evaluateExpression('tasks.tests.pass == true', context)
    ).toBe(true);

    expect(
      evaluator.evaluateExpression('tasks.tests.exitCode == 0', context)
    ).toBe(true);

    expect(
      evaluator.evaluateExpression('variables.env == "production"', context)
    ).toBe(true);

    expect(
      evaluator.evaluateExpression('variables.retries > 2', context)
    ).toBe(true);

    expect(
      evaluator.evaluateExpression('variables.retries <= 3', context)
    ).toBe(true);

    expect(
      evaluator.evaluateExpression('tasks.tests.testCount < 40', context)
    ).toBe(false);
  });

  it("evaluates compound logical expressions (&&, ||, !)", () => {
    const context = {
      variables: { env: "prod", flag: true },
      taskResults: { lint: { clean: true }, test: { pass: false } },
    };

    expect(
      evaluator.evaluateExpression('variables.env == "prod" && tasks.lint.clean == true', context)
    ).toBe(true);

    expect(
      evaluator.evaluateExpression('tasks.test.pass == true || tasks.lint.clean == true', context)
    ).toBe(true);

    expect(
      evaluator.evaluateExpression('tasks.test.pass == true && tasks.lint.clean == true', context)
    ).toBe(false);
  });

  it("strictly blocks prototype pollution attempts in expressions", () => {
    const maliciousExpr1 = '__proto__.polluted == true';
    const maliciousExpr2 = 'constructor.name == "Object"';
    const maliciousExpr3 = 'eval("1+1") == 2';

    expect(evaluator.evaluateExpression(maliciousExpr1, {})).toBe(false);
    expect(evaluator.evaluateExpression(maliciousExpr2, {})).toBe(false);
    expect(evaluator.evaluateExpression(maliciousExpr3, {})).toBe(false);
  });
});
