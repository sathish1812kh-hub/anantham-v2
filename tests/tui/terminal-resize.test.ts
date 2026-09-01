import { describe, it, expect } from "vitest";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";

describe("P8.2 TUI — Terminal Resize & Dimension Adaptation", () => {
  const adapter = new TuiStateAdapter();

  it("renders cleanly across standard, default, and compact dimensions", () => {
    const renderer = new TuiRenderer();

    // Standard 120x40
    renderer.setDimensions({ width: 120, height: 40 });
    const standardOut = renderer.render("dashboard", adapter);
    expect(standardOut).toContain("SYSTEM OVERVIEW");
    expect(standardOut.length).toBeGreaterThan(0);

    // Default 80x24
    renderer.setDimensions({ width: 80, height: 24 });
    const defaultOut = renderer.render("dashboard", adapter);
    expect(defaultOut).toContain("SYSTEM OVERVIEW");

    // Compact 40x15
    renderer.setDimensions({ width: 40, height: 15 });
    const compactOut = renderer.render("dashboard", adapter);
    expect(compactOut).toContain("SYSTEM OVERVIEW");
  });
});
