import { type WorkflowCondition } from "../domain/workflow.js";

export interface EvaluationContext {
  taskResults?: Record<string, unknown>;
  completedTasks?: string[];
  failedTasks?: string[];
  artifacts?: string[];
  variables?: Record<string, unknown>;
}

/**
 * Safe Deterministic Condition Evaluator for Workflow DAGs.
 * Evaluates branch conditions, artifact assertions, and task outcomes
 * without dynamic eval() or code injection risks.
 * PRD Part 2 Section 110 & 115.
 */
export class ConditionEvaluator {
  /**
   * Evaluates a WorkflowCondition against the provided execution context.
   */
  public evaluate(condition: WorkflowCondition, context: EvaluationContext = {}): boolean {
    switch (condition.type) {
      case "artifact_exists": {
        if (!condition.artifactId) return false;
        const artifacts = context.artifacts || [];
        return artifacts.includes(condition.artifactId);
      }

      case "task_status": {
        if (!condition.taskId) return false;
        const expected = (condition.expectedStatus || "completed").toLowerCase();
        if (expected === "completed") {
          return (context.completedTasks || []).includes(condition.taskId);
        }
        if (expected === "failed") {
          return (context.failedTasks || []).includes(condition.taskId);
        }
        return false;
      }

      case "expression": {
        if (!condition.expression) return true;
        return this.evaluateExpression(condition.expression, context);
      }

      case "custom": {
        if (condition.expression) {
          return this.evaluateExpression(condition.expression, context);
        }
        return true;
      }

      default:
        return true;
    }
  }

  /**
   * Safe parser & evaluator for deterministic boolean expressions.
   * Disallows __proto__, constructor, eval, Function, etc.
   */
  public evaluateExpression(expression: string, context: EvaluationContext): boolean {
    const trimmed = expression.trim();
    if (!trimmed) return true;

    // Security Check: Disallow prototype pollution keywords
    if (
      trimmed.includes("__proto__") ||
      trimmed.includes("constructor") ||
      trimmed.includes("prototype") ||
      trimmed.includes("Function") ||
      trimmed.includes("eval") ||
      trimmed.includes("import") ||
      trimmed.includes("process") ||
      trimmed.includes("require")
    ) {
      return false;
    }

    // Split on logical OR ('||')
    const orClauses = this.splitByOperator(trimmed, "||");
    if (orClauses.length > 1) {
      return orClauses.some((clause) => this.evaluateExpression(clause, context));
    }

    // Split on logical AND ('&&')
    const andClauses = this.splitByOperator(trimmed, "&&");
    if (andClauses.length > 1) {
      return andClauses.every((clause) => this.evaluateExpression(clause, context));
    }

    // Check NOT ('!')
    if (trimmed.startsWith("!")) {
      return !this.evaluateExpression(trimmed.slice(1), context);
    }

    // Evaluate comparison operators (==, !=, <=, >=, <, >)
    return this.evaluateComparison(trimmed, context);
  }

  private evaluateComparison(clause: string, context: EvaluationContext): boolean {
    let matchedOp: string | null = null;
    let opIndex = -1;

    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < clause.length; i++) {
      const char = clause[i];
      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
      } else if (!inSingleQuote && !inDoubleQuote) {
        // Check 2-character operators first
        const twoChar = clause.substring(i, i + 2);
        if (twoChar === "==" || twoChar === "!=" || twoChar === "<=" || twoChar === ">=") {
          matchedOp = twoChar;
          opIndex = i;
          break;
        }
        // Check 1-character operators
        const oneChar = clause.substring(i, i + 1);
        if (oneChar === "<" || oneChar === ">") {
          matchedOp = oneChar;
          opIndex = i;
          break;
        }
      }
    }

    if (!matchedOp || opIndex === -1) {
      // Single truthy identifier
      const val = this.resolveValue(clause.trim(), context);
      return Boolean(val);
    }

    const leftRaw = clause.substring(0, opIndex).trim();
    const rightRaw = clause.substring(opIndex + matchedOp.length).trim();

    const leftVal = this.resolveValue(leftRaw, context);
    const rightVal = this.resolveValue(rightRaw, context);

    switch (matchedOp) {
      case "==":
        return leftVal == rightVal;
      case "!=":
        return leftVal != rightVal;
      case "<":
        return Number(leftVal) < Number(rightVal);
      case "<=":
        return Number(leftVal) <= Number(rightVal);
      case ">":
        return Number(leftVal) > Number(rightVal);
      case ">=":
        return Number(leftVal) >= Number(rightVal);
      default:
        return false;
    }
  }

  private resolveValue(token: string, context: EvaluationContext): unknown {
    // 1. Literal numbers
    if (!isNaN(Number(token)) && token !== "") {
      return Number(token);
    }

    // 2. Literal booleans & null
    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "null") return null;

    // 3. String literals (quoted with " or ')
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token.slice(1, -1);
    }

    // 4. Context property access (e.g. tasks.tests.pass, variables.env, completedTasks.includes)
    const parts = token.split(".");
    let current: any = {
      tasks: context.taskResults ?? {},
      variables: context.variables ?? {},
      completedTasks: context.completedTasks ?? [],
      failedTasks: context.failedTasks ?? [],
      artifacts: context.artifacts ?? [],
      ...context.variables,
      ...context.taskResults,
    };

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined;
      }
      if (part === "__proto__" || part === "constructor" || part === "prototype") {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  private splitByOperator(str: string, op: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let lastIndex = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
      } else if (!inSingleQuote && !inDoubleQuote) {
        if (char === "(") depth++;
        else if (char === ")") depth--;
        else if (depth === 0 && str.startsWith(op, i)) {
          parts.push(str.substring(lastIndex, i));
          lastIndex = i + op.length;
          i += op.length - 1;
        }
      }
    }

    parts.push(str.substring(lastIndex));
    return parts.map((p) => p.trim()).filter(Boolean);
  }
}
