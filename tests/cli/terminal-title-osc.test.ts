import { describe, it, expect } from "vitest";
import { TerminalTitleManager } from "../../src/cli/terminal-title-manager.js";

describe("PRD-PART2-214: Terminal Title Dynamic Updates & Progress Reporting", () => {
  const mgr = new TerminalTitleManager();

  it("formats OSC 0 window title escape sequence", () => {
    const esc = mgr.formatTitleEscape("Anantham - Building Milestone 4");
    expect(esc).toBe("\x1b]0;Anantham - Building Milestone 4\x07");
    expect(mgr.getTitle()).toBe("Anantham - Building Milestone 4");
  });

  it("formats OSC 9;4 progress percentage and state escapes", () => {
    const prog50 = mgr.formatProgressEscape("normal", 50);
    expect(prog50).toBe("\x1b]9;4;1;50\x07");
    expect(mgr.getProgress()).toBe(50);

    const errorProg = mgr.formatProgressEscape("error");
    expect(errorProg).toBe("\x1b]9;4;2;100\x07");

    const clearProg = mgr.formatProgressEscape("clear");
    expect(clearProg).toBe("\x1b]9;4;0;0\x07");
    expect(mgr.getProgress()).toBeNull();
  });
});
