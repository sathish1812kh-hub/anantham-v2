import { describe, it, expect } from "vitest";
import { AnsiGradient } from "../../src/tui/ansi-gradient.js";

describe("Antigravity TUI — AnsiGradient Engine", () => {
  it("generates TrueColor RGB linear gradient across string characters", () => {
    const text = "ANANTHAM INFINITE TUI";
    const result = AnsiGradient.linearGradient(
      text,
      AnsiGradient.PALETTES.cyanBlue[0],
      AnsiGradient.PALETTES.cyanBlue[1]
    );

    expect(result).toContain("\x1b[38;2;");
    expect(result).toContain("\x1b[0m");
    // Verify first char has start RGB (0, 242, 254)
    expect(result).toContain("\x1b[38;2;0;242;254mA");
  });

  it("handles empty or single character strings gracefully", () => {
    expect(AnsiGradient.linearGradient("")).toBe("");
    const single = AnsiGradient.linearGradient("X");
    expect(single).toContain("\x1b[38;2;0;242;254mX\x1b[0m");
  });

  it("renders horizontal progress bar with filled and unfilled blocks", () => {
    const bar = AnsiGradient.horizontalBar(50, 100, 20, "cyanBlue");
    expect(bar).toContain("█");
    expect(bar).toContain("░");
    expect(bar).toContain("\x1b[38;2;");
  });

  it("renders unicode sparkline across numeric series", () => {
    const values = [10, 25, 45, 80, 60, 95, 120];
    const spark = AnsiGradient.sparkline(values, "neonPinkViolet");
    expect(spark).toContain("\x1b[38;2;");
    expect(spark.length).toBeGreaterThan(values.length);
    expect(AnsiGradient.sparkline([])).toBe("");
  });
});
