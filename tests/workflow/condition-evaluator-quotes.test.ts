import { describe, it, expect } from "vitest";
import { ConditionEvaluator } from "../../src/workflow/condition-evaluator.js";

describe("W-P10.5-02 ConditionEvaluator Quoted String Operator Handling", () => {
  const evaluator = new ConditionEvaluator();

  it("correctly evaluates equality when string literal contains < or > characters", () => {
    const context = {
      taskResults: {
        analyze: {
          tag: "<critical>",
          code: "STATUS_OK",
        },
      },
    };

    // Literal with < inside single quotes
    const expr1 = "tasks.analyze.tag == '<critical>'";
    expect(evaluator.evaluateExpression(expr1, context)).toBe(true);

    const expr2 = "tasks.analyze.tag == '<warning>'";
    expect(evaluator.evaluateExpression(expr2, context)).toBe(false);

    // Literal with > inside double quotes
    const expr3 = 'tasks.analyze.tag != ">fatal<"';
    expect(evaluator.evaluateExpression(expr3, context)).toBe(true);
  });

  it("correctly evaluates logical operators outside quotes without splitting inside quotes", () => {
    const context = {
      taskResults: {
        proc: {
          msg: "A || B",
        },
      },
    };

    const expr = "tasks.proc.msg == 'A || B'";
    expect(evaluator.evaluateExpression(expr, context)).toBe(true);
  });
});
