import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { ArtifactReferenceValidator } from "../../src/artifacts/artifact-reference-validator.js";
import { PluginPackageVerifier } from "../../src/plugins/plugin-package.js";

describe("W-01 Sibling Directory Path Traversal Adversarial Regression", () => {
  it("rejects sibling directory paths that share a prefix with the base directory in ArtifactReferenceValidator", () => {
    const baseDir = resolve("storage");
    const siblingDirEscape = resolve("storage_evil/payload.txt");
    const nestedChild = resolve("storage/nested/file.txt");

    const siblingResult = ArtifactReferenceValidator.validateStoragePath(siblingDirEscape, baseDir);
    expect(siblingResult.isValid).toBe(false);
    expect(siblingResult.reason).toContain("Path traversal detected");

    const validResult = ArtifactReferenceValidator.validateStoragePath(nestedChild, baseDir);
    expect(validResult.isValid).toBe(true);
  });

  it("rejects sibling directory paths in PluginPackageVerifier validateInstallPath", () => {
    const verifier = new PluginPackageVerifier();
    const baseDir = resolve("plugins");
    
    expect(() => {
      verifier.validateInstallPath("pluginA", baseDir, "../../plugins_evil/malicious.js");
    }).toThrow(/Path traversal violation/);
  });
});
