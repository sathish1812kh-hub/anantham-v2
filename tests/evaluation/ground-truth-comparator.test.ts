import { describe, it, expect } from "vitest";
import { GroundTruthComparator } from "../../src/evaluation/ground-truth-comparator.js";

describe("PRD-EVAL-004: Task Completion Verification & Ground Truth Comparator", () => {
  const comparator = new GroundTruthComparator();

  it("compares exact string matches", () => {
    expect(comparator.compare("hello", "hello", "exact").matched).toBe(true);
    expect(comparator.compare("hello ", "hello", "exact").matched).toBe(false);
  });

  it("compares normalized whitespace matches across line endings", () => {
    const actual = "const a = 1;\r\nconst b = 2;  ";
    const expected = "const a = 1;\nconst b = 2;";
    expect(comparator.compare(actual, expected, "normalized").matched).toBe(true);
  });

  it("compares JSON structural equivalence independent of key order or spacing", () => {
    const jsonA = JSON.stringify({ a: 1, b: 2 });
    const jsonB = JSON.stringify({ a: 1, b: 2 }, null, 2);
    expect(comparator.compare(jsonA, jsonB, "json_structural").matched).toBe(true);
  });

  it("compares numeric outputs within specified tolerance delta", () => {
    expect(comparator.compare("3.14159", "3.14150", "numeric_tolerance", 0.001).matched).toBe(true);
    expect(comparator.compare("3.14159", "3.15000", "numeric_tolerance", 0.001).matched).toBe(false);
  });
});
