import { describe, it, expect } from "vitest";
import { TokenDashboardRenderer } from "../../src/tui/token-dashboard-renderer.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";

describe("Antigravity TUI — TokenDashboardRenderer Analytics View", () => {
  it("formats token quantities concisely with K and M suffixes", () => {
    expect(TokenDashboardRenderer.formatTokens(1_500_000)).toBe("1.50M");
    expect(TokenDashboardRenderer.formatTokens(45_200)).toBe("45.2K");
    expect(TokenDashboardRenderer.formatTokens(850)).toBe("850");
  });

  it("formats USD currency values with proper fractional precision", () => {
    expect(TokenDashboardRenderer.formatUsd(150.25)).toBe("$150.25");
    expect(TokenDashboardRenderer.formatUsd(6.425)).toBe("$6.425");
    expect(TokenDashboardRenderer.formatUsd(0.0125)).toBe("$0.0125");
  });

  it("renders full token analytics dashboard layout with cards, leaderboard and sparklines", () => {
    const lines = TokenDashboardRenderer.render(80, 24);
    expect(lines.length).toBeGreaterThan(10);

    const plain = TuiSanitizer.stripAnsi(lines.join("\n"));
    expect(plain).toContain("ANANTHAM TOKEN USAGE MATRIX & FINANCIAL DASHBOARD");
    expect(plain).toContain("TODAY'S TOKENS");
    expect(plain).toContain("MONTH-TO-DATE");
    expect(plain).toContain("ESTIMATED COST & BUDGET");
    expect(plain).toContain("TOP CONSUMING MODELS");
    expect(plain).toContain("7-DAY CONSUMPTION TREND");
    expect(plain).toContain("Back to Dashboard");
  });
});
