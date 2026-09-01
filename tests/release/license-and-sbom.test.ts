import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { ReleaseEngineeringEngine } from "../../scripts/release-engineering.mjs";

describe("P9.6 Release Engineering — License Compliance & SBOM Integrity", () => {
  it("audits all dependencies and verifies 100% compliance with approved Open Source licenses", () => {
    const report = ReleaseEngineeringEngine.auditLicenses();

    expect(report.project).toBe("anantham-v2");
    expect(report.rootLicense).toBe("Apache-2.0");
    expect(report.allCompliant).toBe(true);
    expect(report.violations.length).toBe(0);
    expect(report.dependencies.length).toBeGreaterThan(0);
  });

  it("generates valid CycloneDX 1.5 and SPDX 2.3 SBOMs matching production dependencies", () => {
    const { cycloneDx, spdx } = ReleaseEngineeringEngine.generateSBOM();

    // CycloneDX verification
    expect(cycloneDx.bomFormat).toBe("CycloneDX");
    expect(cycloneDx.specVersion).toBe("1.5");
    expect(cycloneDx.metadata.component.name).toBe("anantham-v2");
    expect(cycloneDx.components.some((c) => c.name === "zod")).toBe(true);

    // SPDX verification
    expect(spdx.spdxVersion).toBe("SPDX-2.3");
    expect(spdx.name).toContain("anantham-v2");
    expect(spdx.packages.some((p) => p.name === "zod")).toBe(true);
  });

  it("verifies SBOM consistency against package.json dependency declarations", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const { cycloneDx } = ReleaseEngineeringEngine.generateSBOM();

    const declaredDeps = Object.keys(pkg.dependencies || {});
    const sbomDeps = cycloneDx.components.map((c) => c.name);

    for (const dep of declaredDeps) {
      expect(sbomDeps).toContain(dep);
    }
  });
});
