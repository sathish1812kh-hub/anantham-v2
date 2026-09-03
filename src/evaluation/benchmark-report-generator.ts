/**
 * Automated Benchmark Report Generator (HTML/Markdown Dashboards)
 * PRD-PART2-315: Automated Benchmark Report Generator with HTML/Markdown Dashboards
 */

import type { BenchmarkEvaluationReport } from "./eval-engine.js";

export class BenchmarkReportGenerator {
  public generateMarkdownReport(report: BenchmarkEvaluationReport): string {
    const lines: string[] = [
      `# Benchmark Evaluation Report: ${report.benchmarkName}`,
      "",
      `| Metric | Value |`,
      `| :--- | :--- |`,
      `| **Total Tests** | ${report.totalTests} |`,
      `| **Passed** | ${report.passedCount} |`,
      `| **Failed** | ${report.failedCount} |`,
      `| **Pass Rate** | ${(report.passRate * 100).toFixed(1)}% |`,
      `| **Avg Latency** | ${report.averageDurationMs} ms |`,
      "",
      "## Test Results Summary",
      "",
      "| Test Case | Status | Latency | Details |",
      "| :--- | :--- | :--- | :--- |",
    ];

    for (const r of report.results) {
      const statusIcon = r.passed ? "PASS" : "FAIL";
      const errorMsg = r.error ? `\`${r.error.slice(0, 40)}\`` : "-";
      lines.push(`| \`${r.testCaseId}\` | **${statusIcon}** | ${r.durationMs}ms | ${errorMsg} |`);
    }

    return lines.join("\n");
  }

  public generateHtmlReport(report: BenchmarkEvaluationReport): string {
    const passPercentage = (report.passRate * 100).toFixed(1);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Benchmark: ${report.benchmarkName}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #0f172a; color: #f8fafc; }
    .card { background: #1e293b; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; }
    .metric { font-size: 2rem; font-weight: bold; color: #38bdf8; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #334155; }
    .pass { color: #4ade80; font-weight: bold; }
    .fail { color: #f87171; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Evaluation Report: ${report.benchmarkName}</h1>
  <div class="card">
    <div class="metric">${passPercentage}% Pass Rate</div>
    <p>Total: ${report.totalTests} | Passed: ${report.passedCount} | Failed: ${report.failedCount} | Latency: ${report.averageDurationMs}ms</p>
  </div>
</body>
</html>`;
  }
}
