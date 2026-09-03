import { describe, it, expect } from "vitest";
import { ComplianceReportExporter } from "../../src/saas/compliance-report-exporter.js";

describe("PRD-SAAS-006: Enterprise Compliance & Audit Reporting", () => {
  const exporter = new ComplianceReportExporter();

  it("generates SOC 2, GDPR, and HIPAA compliance reports with controls and audit metrics", () => {
    const soc2 = exporter.generateReport("SOC2", "tenant_corp", 1500);
    expect(soc2.framework).toBe("SOC2");
    expect(soc2.auditTrailCount).toBe(1500);
    expect(soc2.sections.some((s) => s.name.includes("Access Control"))).toBe(true);

    const gdpr = exporter.generateReport("GDPR", "tenant_corp", 1500);
    expect(gdpr.framework).toBe("GDPR");
    expect(gdpr.sections.some((s) => s.name.includes("Right to Erasure"))).toBe(true);

    const hipaa = exporter.generateReport("HIPAA", "tenant_corp", 1500);
    expect(hipaa.framework).toBe("HIPAA");
    expect(hipaa.sections.some((s) => s.name.includes("Transmission Security"))).toBe(true);
  });
});
