import { describe, it, expect } from "vitest";
import { PluginPackageVerifier } from "../../src/plugins/plugin-package.js";

describe("P5.2 Plugins — Checksum & Package Integrity", () => {
  const verifier = new PluginPackageVerifier();

  it("computes and verifies SHA-256 checksums accurately", () => {
    const payload = "function execute() { return 'secure'; }";
    const checksum = verifier.computeChecksum(payload);

    expect(checksum).toHaveLength(64);
    expect(verifier.verifyChecksum(payload, checksum)).toBe(true);

    const tamperedPayload = payload + " // backdoor";
    expect(verifier.verifyChecksum(tamperedPayload, checksum)).toBe(false);
  });

  it("blocks path traversal attempts outside install directory", () => {
    const baseDir = "C:/anantham/plugins";

    // Valid path
    const valid = verifier.validateInstallPath("my.plugin", baseDir, "dist/index.js");
    expect(valid).toContain("my.plugin");

    // Malicious traversing path
    expect(() =>
      verifier.validateInstallPath("my.plugin", baseDir, "../../windows/system32/cmd.exe")
    ).toThrow(/Path traversal violation/);
  });
});
