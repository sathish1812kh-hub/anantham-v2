import { describe, it, expect } from "vitest";
import { CommandParser } from "../../src/cli/command-parser.js";

describe("P8.1 CLI — Command Parser & Tokenizer", () => {
  const parser = new CommandParser();

  it("parses slash command with positional args and flags", () => {
    const raw = '/project select "proj_123" --verbose --mode=json -f false';
    const parsed = parser.parse(raw);

    expect(parsed.name).toBe("project");
    expect(parsed.isSlashCommand).toBe(true);
    expect(parsed.args).toEqual(["select", "proj_123"]);
    expect(parsed.options.verbose).toBe(true);
    expect(parsed.options.mode).toBe("json");
    expect(parsed.options.f).toBe(false);
  });

  it("parses numeric and boolean options correctly", () => {
    const raw = "/task list --limit 10 --all=true --offset -5";
    const parsed = parser.parse(raw);

    expect(parsed.name).toBe("task");
    expect(parsed.options.limit).toBe(10);
    expect(parsed.options.all).toBe(true);
    expect(parsed.options.offset).toBe(-5);
  });

  it("handles double and single quoted strings with spaces", () => {
    const raw = "/task create \"Build distributed consensus engine\" 'Deploy to production'";
    const parsed = parser.parse(raw);

    expect(parsed.name).toBe("task");
    expect(parsed.args).toEqual(["create", "Build distributed consensus engine", "Deploy to production"]);
  });

  it("rejects empty input and invalid control characters", () => {
    expect(() => parser.parse("   ")).toThrow("Empty command input.");
    expect(() => parser.parse("command\x00withNull")).toThrow("Command input contains invalid control characters.");
  });

  it("rejects unterminated quotes", () => {
    expect(() => parser.parse('/task create "unterminated string')).toThrow("Unterminated quoted string");
    expect(() => parser.parse("/task create 'unterminated single")).toThrow("Unterminated quoted string");
  });
});
