import { describe, it, expect } from "vitest";
import { TerminalLayout } from "../../src/tui/terminal-layout.js";

describe("P8.2 TUI — Terminal Layout & Box Drawing", () => {
  it("draws box with title and single borders", () => {
    const lines = ["Line 1", "Line 2 is longer"];
    const boxed = TerminalLayout.drawBox(lines, { title: "TEST BOX", width: 30 });

    expect(boxed.length).toBe(4);
    expect(boxed[0]).toContain("┌ TEST BOX ");
    expect(boxed[0]).toContain("┐");
    expect(boxed[1]).toContain("│Line 1");
    expect(boxed[1]).toContain("│");
    expect(boxed[3]).toContain("└");
    expect(boxed[3]).toContain("┘");
  });

  it("draws box with double borders", () => {
    const lines = ["Double border content"];
    const boxed = TerminalLayout.drawBox(lines, { borderStyle: "double", width: 35 });

    expect(boxed[0]).toContain("╔");
    expect(boxed[0]).toContain("╗");
    expect(boxed[boxed.length - 1]).toContain("╚");
    expect(boxed[boxed.length - 1]).toContain("╝");
  });

  it("renders status bar and navigation tab bar", () => {
    const statusBar = TerminalLayout.renderStatusBar("NORMAL", "proj_01", "sess_01", { width: 80, height: 24 });
    expect(statusBar).toContain("❖ Anantham V2");
    expect(statusBar).toContain("Project: proj_01");
    expect(statusBar).toContain("Status: [NORMAL]");

    const tabBar = TerminalLayout.renderTabBar(
      [
        { key: "1", label: "Dashboard", mode: "dashboard", active: true },
        { key: "2", label: "Session", mode: "session", active: false },
      ],
      80
    );
    expect(tabBar).toContain("[1] Dashboard");
    expect(tabBar).toContain("[2] Session");
  });

  it("renders formatted aligned tables", () => {
    const headers = ["ID", "Name", "Status"];
    const rows = [
      ["1", "Alpha", "Active"],
      ["2", "Beta", "Paused"],
    ];
    const table = TerminalLayout.renderTable(headers, rows, [5, 10, 10]);

    expect(table.length).toBe(4);
    expect(table[0]).toContain("ID");
    expect(table[0]).toContain("Name");
    expect(table[1]).toContain("─┼─");
    expect(table[2]).toContain("Alpha");
  });
});
