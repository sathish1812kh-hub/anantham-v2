import { describe, it, expect } from "vitest";
import {
  SecurityMetadataSchema,
  TrustLevelSchema,
  SensitivityLevelSchema,
  AuthorityClassSchema,
  type SecurityMetadata,
} from "../../src/domain/security.js";

describe("Security Domain Contracts", () => {
  it("validates valid SecurityMetadata", () => {
    const validMeta: SecurityMetadata = {
      trust: "trusted",
      sensitivity: "normal",
      scanned: true,
      scanVersion: "1.0.0",
      authority: "developer",
      sandboxBoundary: "docker",
    };

    const parsed = SecurityMetadataSchema.parse(validMeta);
    expect(parsed).toEqual(validMeta);
  });

  it("rejects invalid trust levels", () => {
    expect(() => TrustLevelSchema.parse("superuser")).toThrow();
  });

  it("rejects invalid sensitivity levels", () => {
    expect(() => SensitivityLevelSchema.parse("top-secret")).toThrow();
  });

  it("validates all 12 authority classes from PRD Part 1 Section 119", () => {
    const authorities = [
      "system",
      "security-policy",
      "developer",
      "user",
      "project-instruction",
      "skill",
      "agent",
      "tool-output",
      "mcp-output",
      "repository-content",
      "web-content",
      "attachment",
    ];

    for (const auth of authorities) {
      expect(AuthorityClassSchema.parse(auth)).toBe(auth);
    }
  });
});
