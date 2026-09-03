import { describe, it, expect } from "vitest";
import { ShellIntegrationGenerator } from "../../src/cli/shell-integration-generator.js";

describe("PRD-PART2-212: Shell Integration Scripts & Prompt Hooks", () => {
  const gen = new ShellIntegrationGenerator();

  it("generates bash integration script with preexec and precmd OSC 133 sequences", () => {
    const bash = gen.generateScript("bash");
    expect(bash).toContain("Anantham V2 Shell Integration for Bash");
    expect(bash).toContain("\\033]133;C\\007");
    expect(bash).toContain("__anantham_precmd");
  });

  it("generates zsh integration script using add-zsh-hook", () => {
    const zsh = gen.generateScript("zsh");
    expect(zsh).toContain("add-zsh-hook");
    expect(zsh).toContain("\\e]133;A\\a");
  });

  it("generates fish integration script with fish_preexec event", () => {
    const fish = gen.generateScript("fish");
    expect(fish).toContain("--on-event fish_preexec");
    expect(fish).toContain("--on-event fish_postexec");
  });

  it("generates PowerShell global:prompt function with OSC 133 sequences", () => {
    const pwsh = gen.generateScript("powershell");
    expect(pwsh).toContain("function global:prompt");
    expect(pwsh).toContain("[Console]::Write");
  });
});
