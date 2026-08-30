import { describe, it, expect } from "vitest";
import { ContentIngestionEngine } from "../../src/content/content-ingestion-engine.js";
import { ProvenanceManager } from "../../src/content/provenance-manager.js";
import { ContentAccessValidator } from "../../src/content/content-access-validator.js";

describe("Provenance & Security Integrity", () => {
  it("chains derived provenance lineage to parent ContentObject", async () => {
    const parentContent = await ContentIngestionEngine.ingest({
      data: "# Original Document\nSome content here.",
      name: "doc.md",
      source: { type: "filesystem", uri: "file:///workspace/doc.md" },
      actor: "user_01",
    });

    const derivedProv = ProvenanceManager.createDerivedProvenance(
      parentContent,
      "summarized:markdown",
      "agent_researcher"
    );

    expect(derivedProv.sourceType).toBe("derived");
    expect(derivedProv.parentIds).toContain(parentContent.id);
    expect(derivedProv.transformations).toContain("summarized:markdown");
    expect(derivedProv.extractor.name).toBe("anantham-provenance-manager");
  });

  it("verifies cryptographic SHA-256 integrity and detects payload tampering", async () => {
    const rawData = "Authoritative persistence state";
    const content = await ContentIngestionEngine.ingest({
      data: rawData,
      name: "state.txt",
      source: { type: "tool", uri: "tool://state_snapshot" },
    });

    expect(ProvenanceManager.verifyIntegrity(content, rawData)).toBe(true);
    expect(ProvenanceManager.verifyIntegrity(content, "Tampered persistence state")).toBe(false);
  });

  it("rejects unauthorized sensitivity downgrades by untrusted or normal actors", () => {
    const validEscalation = ContentAccessValidator.validateClassificationTransition("normal", "sensitive", "user-content");
    expect(validEscalation.allowed).toBe(true);

    const invalidDowngrade = ContentAccessValidator.validateClassificationTransition("secret", "public", "untrusted");
    expect(invalidDowngrade.allowed).toBe(false);
    expect(invalidDowngrade.reason).toContain("Unauthorized sensitivity downgrade");
  });

  it("enforces cross-project boundary isolation for non-public content", async () => {
    const projectContent = await ContentIngestionEngine.ingest({
      data: "Confidential Project Alpha specs",
      name: "specs.txt",
      source: { type: "filesystem" },
      sensitivity: "sensitive",
    });

    const sameProject = ContentAccessValidator.verifyProjectIsolation(projectContent, "prj_alpha", "prj_alpha");
    expect(sameProject.allowed).toBe(true);

    const crossProject = ContentAccessValidator.verifyProjectIsolation(projectContent, "prj_beta", "prj_alpha");
    expect(crossProject.allowed).toBe(false);
    expect(crossProject.reason).toContain("Cross-project access violation");
  });
});
