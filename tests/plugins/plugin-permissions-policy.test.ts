import { describe, it, expect } from "vitest";
import { PluginPermissionsManager } from "../../src/plugins/plugin-permissions.js";

describe("P5.2 Plugins — Permissions & Policy Review", () => {
  const manager = new PluginPermissionsManager();

  it("permits scoped network hosts and rejects wildcard violations", () => {
    const permissions = {
      network: ["api.github.com", "crates.io"],
      filesystem: { read: [], write: [] },
    };

    expect(manager.isHostPermitted("api.github.com", permissions)).toBe(true);
    expect(manager.isHostPermitted("raw.githubusercontent.com", permissions)).toBe(false);
    expect(manager.isHostPermitted("malicious-site.com", permissions)).toBe(false);
  });

  it("denies dangerous filesystem write paths", () => {
    const dangerousPermissions = {
      filesystem: { read: ["./src"], write: ["/etc/passwd", "../system32"] },
    };

    const review = manager.reviewPermissions(dangerousPermissions, "unknown");
    expect(review.isGranted).toBe(false);
    expect(review.deniedPermissions.length).toBeGreaterThan(0);
  });

  it("requires approval for elevated operations from unreviewed plugins", () => {
    const elevatedPermissions = {
      subprocess: true,
      credentials: ["cred_openai_key"],
      filesystem: { read: [], write: [] },
    };

    const review = manager.reviewPermissions(elevatedPermissions, "unknown");
    expect(review.isGranted).toBe(true);
    expect(review.requiresApproval).toBe(true);
  });
});
