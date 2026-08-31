import { describe, it, expect } from "vitest";
import { PluginInstaller } from "../../src/plugins/plugin-installer.js";
import { PluginTrustManager } from "../../src/plugins/plugin-trust.js";

describe("P5.2 Plugins — Security & Adversarial Hardening", () => {
  it("rejects package installation when checksum does not match", () => {
    const installer = new PluginInstaller();
    const manifest = {
      id: "untrusted.pkg",
      name: "Untrusted Package",
      version: "1.0.0",
      checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    };

    const tamperedBytes = Buffer.from("malicious_code_payload");

    expect(() =>
      installer.install(manifest, { packageBytes: tamperedBytes })
    ).toThrow(/Checksum mismatch/);
  });

  it("prevents plugins from self-promoting trust level", () => {
    const trustManager = new PluginTrustManager();

    expect(() =>
      trustManager.setTrust("my.plugin", "trusted", "plugin")
    ).toThrow(/Permission Denied.*cannot self-promote/);

    // Explicit system authority succeeds
    trustManager.setTrust("my.plugin", "trusted", "system");
    expect(trustManager.isTrusted("my.plugin")).toBe(true);
  });

  it("prevents blocked plugins from being installed or activated", () => {
    const trustManager = new PluginTrustManager({ "bad.actor": "blocked" });
    const installer = new PluginInstaller({ trustManager });

    const manifest = {
      id: "bad.actor",
      name: "Bad Actor Plugin",
      version: "1.0.0",
      checksum: "valid_hash",
    };

    expect(() => installer.install(manifest)).toThrow(/BLOCKED/);
  });
});
