import { describe, it, expect } from "vitest";
import { CommandPalette } from "../../src/tui/command-palette.js";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";

describe("Antigravity TUI — Slash Command Palette Component", () => {
  it("provides comprehensive command palette catalog", () => {
    const commands = CommandPalette.COMMANDS;
    expect(commands.some((c) => c.command === "/teamwork-preview")).toBe(true);
    expect(commands.some((c) => c.command === "/usage")).toBe(true);
    expect(commands.some((c) => c.command === "/models")).toBe(true);
    expect(commands.some((c) => c.command === "/key")).toBe(true);
    expect(commands.some((c) => c.command === "/status")).toBe(true);
    expect(commands.some((c) => c.command === "/clear")).toBe(true);
  });

  it("filters commands dynamically by slash command or search query", () => {
    const all = CommandPalette.filterCommands("/");
    expect(all.length).toBe(CommandPalette.COMMANDS.length);

    const usage = CommandPalette.filterCommands("/usa");
    expect(usage.length).toBe(1);
    expect(usage[0]!.command).toBe("/usage");

    const models = CommandPalette.filterCommands("model");
    expect(models.length).toBeGreaterThanOrEqual(2);

    const empty = CommandPalette.filterCommands("/nonexistentcommandxyz");
    expect(empty.length).toBe(0);
  });

  it("renders popover overlay box with selection indicators and shortcuts", () => {
    const filtered = CommandPalette.filterCommands("/usage");
    const overlay = CommandPalette.renderOverlay(filtered, 0, 80);

    expect(overlay.length).toBeGreaterThanOrEqual(3);
    const plain = TuiSanitizer.stripAnsi(overlay.join("\n"));
    expect(plain).toContain("COMMAND PALETTE");
    expect(plain).toContain("▶");
    expect(plain).toContain("/usage");
    expect(plain).toContain("[Alt+U]");
    expect(plain).toContain("Navigate");
  });

  it("renders empty state placeholder gracefully", () => {
    const overlay = CommandPalette.renderOverlay([], 0, 80);
    const plain = TuiSanitizer.stripAnsi(overlay.join("\n"));
    expect(plain).toContain("No matching commands found");
  });
});
