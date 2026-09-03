/**
 * Task Completion Verification & Ground Truth Comparator
 * PRD-EVAL-004: Task Completion Verification & Ground Truth Comparator
 */

export interface ComparisonResult {
  matched: boolean;
  strategy: "exact" | "normalized" | "json_structural" | "numeric_tolerance";
  diffDetails?: string;
}

export class GroundTruthComparator {
  public compare(
    actual: string,
    expected: string,
    strategy: "exact" | "normalized" | "json_structural" | "numeric_tolerance" = "normalized",
    tolerance = 0.001
  ): ComparisonResult {
    switch (strategy) {
      case "exact":
        return {
          matched: actual === expected,
          strategy: "exact",
          diffDetails: actual === expected ? undefined : `Actual length ${actual.length} vs Expected ${expected.length}`,
        };

      case "normalized": {
        const normActual = actual.trim().replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");
        const normExpected = expected.trim().replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");
        return {
          matched: normActual === normExpected,
          strategy: "normalized",
        };
      }

      case "json_structural": {
        try {
          const parsedActual = JSON.parse(actual);
          const parsedExpected = JSON.parse(expected);
          const match = JSON.stringify(parsedActual) === JSON.stringify(parsedExpected);
          return {
            matched: match,
            strategy: "json_structural",
          };
        } catch (err) {
          return {
            matched: false,
            strategy: "json_structural",
            diffDetails: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }

      case "numeric_tolerance": {
        const numActual = parseFloat(actual);
        const numExpected = parseFloat(expected);
        if (isNaN(numActual) || isNaN(numExpected)) {
          return { matched: false, strategy: "numeric_tolerance", diffDetails: "NaN encountered" };
        }
        const delta = Math.abs(numActual - numExpected);
        return {
          matched: delta <= tolerance,
          strategy: "numeric_tolerance",
          diffDetails: `Delta: ${delta} (tolerance: ${tolerance})`,
        };
      }
    }
  }
}
