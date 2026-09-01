import { describe, it, expect } from "vitest";
import { TuiSanitizer } from "../../src/tui/tui-sanitizer.js";

describe("P8.2 TUI — Sanitizer & Escape Sequence Defense", () => {
  it("strips ANSI color and cursor escape codes", () => {
    const malicious = "\x1b[31;1mRed Alert!\x1b[0m \x1b[2J\x1b[H";
    const clean = TuiSanitizer.sanitize(malicious);
    expect(clean).toBe("Red Alert! ");
  });

  it("strips OSC window title and hyperlink sequences", () => {
    const malicious = "\x1b]0;Spoofed Window Title\x07Normal Task Objective";
    const clean = TuiSanitizer.sanitize(malicious);
    expect(clean).toBe("Normal Task Objective");
  });

  it("strips dangerous non-printable control characters", () => {
    const raw = "Task\x00Objective\x07With\x08ControlChars";
    const clean = TuiSanitizer.sanitize(raw);
    expect(clean).toBe("TaskObjectiveWithControlChars");
  });

  it("truncates text with ellipsis safely", () => {
    const long = "This is a very long task objective that exceeds the column width boundary";
    expect(TuiSanitizer.truncate(long, 20)).toBe("This is a very lo...");
    expect(TuiSanitizer.truncate("Short", 10)).toBe("Short");
  });

  it("pads text with spaces to exact width", () => {
    const text = "Status";
    const padded = TuiSanitizer.pad(text, 10);
    expect(padded).toBe("Status    ");
    expect(padded.length).toBe(10);
  });
});
