import { describe, it, expect } from "vitest";
import { TerminalThemeRenderer } from "../../src/cli/terminal-theme-renderer.js";

describe("PRD-CLI-007: Unified Output Formatting, Themes & Rendering", () => {
  const renderer = new TerminalThemeRenderer("dark");

  it("formats git diffs with green additions and red deletions", () => {
    const diff = `
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
-const oldVal = 1;
+const newVal = 2;
`;
    const formatted = renderer.formatDiff(diff);
    expect(formatted).toContain("\x1b[32m+const newVal = 2;");
    expect(formatted).toContain("\x1b[31m-const oldVal = 1;");
  });

  it("formats success, error, and info status messages", () => {
    const successMsg = renderer.formatMessage("success", "Operation completed");
    expect(successMsg).toContain("✓ Operation completed");

    const errorMsg = renderer.formatMessage("error", "Database disconnected");
    expect(errorMsg).toContain("✗ Database disconnected");
  });

  it("supports switching between dark, light, and plain themes", () => {
    renderer.setTheme("plain");
    const plainDiff = renderer.formatDiff("+plain add line");
    expect(plainDiff).not.toContain("\x1b[");

    renderer.setTheme("dark");
    expect(renderer.getTheme()).toBe("dark");
  });
});
