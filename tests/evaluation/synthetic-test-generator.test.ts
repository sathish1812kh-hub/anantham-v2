import { describe, it, expect } from "vitest";
import { SyntheticCaseGenerator } from "../../src/evaluation/synthetic-case-generator.js";

describe("PRD-PART2-316: Synthetic Test Case Generator for Edge-Case Discovery", () => {
  const generator = new SyntheticCaseGenerator();

  it("generates synthetic adversarial test cases across all categories", () => {
    const cases = generator.generateTestCases();
    expect(cases.length).toBeGreaterThanOrEqual(8);

    // Verify empty/null category
    expect(cases.some((c) => c.id === "synth_empty_str" && c.input === "")).toBe(true);

    // Verify boundary length category
    expect(cases.some((c) => c.id === "synth_giant_payload" && c.input.length === 50000)).toBe(true);

    // Verify unicode stress category
    expect(cases.some((c) => c.id === "synth_zalgo_emojis")).toBe(true);

    // Verify path traversal category
    expect(cases.some((c) => c.id === "synth_traversal_posix" && c.input.includes("../"))).toBe(true);

    // Verify injection attacks category
    expect(cases.some((c) => c.id === "synth_sqli" && c.input.includes("DROP TABLE"))).toBe(true);
  });
});
