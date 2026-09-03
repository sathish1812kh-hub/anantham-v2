import { describe, it, expect } from "vitest";
import { InteractiveShellEngine } from "../../src/cli/interactive-shell.js";

describe("PRD-CLI-002: Interactive Shell Loop", () => {
  it("tracks command history and navigates history buffers cleanly", () => {
    const shell = new InteractiveShellEngine();

    shell.processInputLine("help");
    shell.processInputLine("/model gemini-2.5-pro");
    shell.processInputLine("run tests");

    const history = shell.getHistory();
    expect(history.length).toBe(3);
    expect(history[0]).toBe("help");
    expect(history[1]).toBe("/model gemini-2.5-pro");
    expect(history[2]).toBe("run tests");

    // History navigation up
    expect(shell.navigateHistory("up")).toBe("run tests");
    expect(shell.navigateHistory("up")).toBe("/model gemini-2.5-pro");

    // History navigation down
    expect(shell.navigateHistory("down")).toBe("run tests");
    expect(shell.navigateHistory("down")).toBe("");
  });

  it("parses slash commands and exit commands", () => {
    const shell = new InteractiveShellEngine();

    const slashCmd = shell.parseCommand("/model gpt-4o");
    expect(slashCmd.isSlashCommand).toBe(true);
    expect(slashCmd.command).toBe("/model");
    expect(slashCmd.args).toEqual(["gpt-4o"]);

    const exitCmd = shell.parseCommand("exit");
    expect(exitCmd.exitShell).toBe(true);

    const promptCmd = shell.parseCommand("Refactor the parser subsystem");
    expect(promptCmd.isSlashCommand).toBe(false);
    expect(promptCmd.command).toBe("prompt");
  });
});
