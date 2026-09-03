import { describe, it, expect } from "vitest";
import { BenchmarkReportGenerator } from "../../src/evaluation/benchmark-report-generator.js";
import type { BenchmarkEvaluationReport } from "../../src/evaluation/eval-engine.js";

describe("PRD-PART2-315: Automated Benchmark Report Generator with HTML/Markdown Dashboards", () => {
  const generator = new BenchmarkReportGenerator();

  const mockReport: BenchmarkEvaluationReport = {
    benchmarkName: "SWE-bench-lite",
    totalTests: 10,
    passedCount: 8,
    failedCount: 2,
    passRate: 0.8,
    averageDurationMs: 1450,
    results: [
      { testCaseId: "django-1100", passed: true, durationMs: 1200, actualOutput: "patch_applied" },
      { testCaseId: "flask-2200", passed: false, durationMs: 1700, actualOutput: "", error: "AssertionFailed" },
    ],
  };

  it("generates markdown dashboard report containing summary and test details", () => {
    const md = generator.generateMarkdownReport(mockReport);
    expect(md).toContain("# Benchmark Evaluation Report: SWE-bench-lite");
    expect(md).toContain("**Pass Rate** | 80.0%");
    expect(md).toContain("| `django-1100` | **PASS** |");
    expect(md).toContain("| `flask-2200` | **FAIL** |");
  });

  it("generates HTML dashboard report with styled cards and metrics", () => {
    const html = generator.generateHtmlReport(mockReport);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("80.0% Pass Rate");
    expect(html).toContain("SWE-bench-lite");
  });
});
