import { describe, it, expect } from "vitest";
import { InteractiveShellEngine } from "../../src/cli/interactive-shell.js";

describe("PRD-CLI-005: Multi-Line Input & Advanced Editor Integration", () => {
  it("buffers multi-line input enclosed in triple quotes until closing delimiter is received", () => {
    const shell = new InteractiveShellEngine();

    const res1 = shell.processInputLine('"""def calculate():');
    expect(res1.completed).toBe(false);

    const res2 = shell.processInputLine("    a = 10");
    expect(res2.completed).toBe(false);

    const res3 = shell.processInputLine('    return a"""');
    expect(res3.completed).toBe(true);
    expect(res3.fullInput).toBe("def calculate():\n    a = 10\n    return a");
  });

  it("buffers multi-line input using trailing backslash continuation lines", () => {
    const shell = new InteractiveShellEngine();

    const res1 = shell.processInputLine("SELECT * FROM users \\");
    expect(res1.completed).toBe(false);

    const res2 = shell.processInputLine("WHERE active = true;");
    expect(res2.completed).toBe(true);
    expect(res2.fullInput).toBe("SELECT * FROM users \nWHERE active = true;");
  });
});
