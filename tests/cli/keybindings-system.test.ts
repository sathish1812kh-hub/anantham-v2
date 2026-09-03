import { describe, it, expect } from "vitest";
import { KeybindingsManager } from "../../src/cli/keybindings-manager.js";

describe("PRD-CLI-004: Keyboard Shortcuts & Keybinding System", () => {
  const mgr = new KeybindingsManager();

  it("resolves default keyboard shortcuts and allows custom keybinding registration", () => {
    // Default shortcuts
    expect(mgr.resolveAction("c", { ctrl: true })).toBe("cancel_execution");
    expect(mgr.resolveAction("d", { ctrl: true })).toBe("exit_repl");
    expect(mgr.resolveAction("l", { ctrl: true })).toBe("clear_screen");
    expect(mgr.resolveAction("up")).toBe("history_up");
    expect(mgr.resolveAction("tab")).toBe("autocomplete");

    // Custom shortcut
    mgr.registerShortcut({
      key: "k",
      ctrl: true,
      action: "toggle_multiline",
      description: "Toggle multi-line mode",
    });

    expect(mgr.resolveAction("k", { ctrl: true })).toBe("toggle_multiline");
  });
});
