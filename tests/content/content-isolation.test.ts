import { describe, it, expect } from "vitest";
import { ContentIngestionEngine } from "../../src/content/content-ingestion-engine.js";
import { ContentAccessValidator } from "../../src/content/content-access-validator.js";

describe("P2.1 Content Subsystem — Content Access & Isolation Validator", () => {
  it("allows access when clearance matches or exceeds content sensitivity", async () => {
    const content = await ContentIngestionEngine.ingest({
      data: "Sensitive architecture specifications",
      name: "arch.md",
      source: { type: "upload" },
      sensitivity: "sensitive",
    });

    const checkPermitted = ContentAccessValidator.verifyAccess(content, {
      actorSensitivityClearance: "sensitive",
    });
    expect(checkPermitted.allowed).toBe(true);

    const checkHigherPermitted = ContentAccessValidator.verifyAccess(content, {
      actorSensitivityClearance: "secret",
    });
    expect(checkHigherPermitted.allowed).toBe(true);
  });

  it("denies access when actor clearance is lower than content sensitivity", async () => {
    const secretContent = await ContentIngestionEngine.ingest({
      data: "API Credentials and Private Keys",
      name: "keys.env",
      source: { type: "upload" },
      sensitivity: "secret",
    });

    const checkDenied = ContentAccessValidator.verifyAccess(secretContent, {
      actorSensitivityClearance: "normal",
    });

    expect(checkDenied.allowed).toBe(false);
    expect(checkDenied.reason).toContain("exceeds actor clearance");
  });

  it("restricts untrusted actors to public content only", async () => {
    const internalContent = await ContentIngestionEngine.ingest({
      data: "Internal team guidelines",
      name: "guidelines.txt",
      source: { type: "upload" },
      sensitivity: "normal",
    });

    const checkUntrustedDenied = ContentAccessValidator.verifyAccess(internalContent, {
      actorTrust: "untrusted",
      actorSensitivityClearance: "normal",
    });

    expect(checkUntrustedDenied.allowed).toBe(false);
    expect(checkUntrustedDenied.reason).toContain("untrusted actors are restricted to public content only");
  });
});
