import { describe, it, expect } from "vitest";
import { HookRegistry } from "../../src/hooks/hook-registry.js";
import { HookMatcher } from "../../src/hooks/hook-matcher.js";

describe("P5.4 Hooks — Trigger Matching & Filter Predicates", () => {
  const registry = new HookRegistry();
  const matcher = new HookMatcher();

  registry.register({
    id: "tool-pre-check",
    name: "Tool Pre Check",
    version: "1.0.0",
    event: "BeforeTool",
    action: { type: "allow" },
    filter: { toolName: "filesystem.write" },
    priority: 100,
    enabled: true,
    scope: "global",
  });

  registry.register({
    id: "edit-src-check",
    name: "Edit Src Check",
    version: "1.0.0",
    event: "BeforeEdit",
    action: { type: "allow" },
    filter: { pathPattern: "^src/.*\\.ts$" },
    priority: 100,
    enabled: true,
    scope: "global",
  });

  it("matches hook when event and toolName filter match", () => {
    const matched = matcher.match(registry.list(), {
      event: "BeforeTool",
      payload: { toolName: "filesystem.write" },
    });

    expect(matched).toHaveLength(1);
    expect(matched[0]?.id).toBe("tool-pre-check");
  });

  it("does not match when toolName filter differs", () => {
    const matched = matcher.match(registry.list(), {
      event: "BeforeTool",
      payload: { toolName: "shell.execute" },
    });

    expect(matched).toHaveLength(0);
  });

  it("matches regex path pattern for BeforeEdit event", () => {
    const matchSuccess = matcher.match(registry.list(), {
      event: "BeforeEdit",
      payload: { filePath: "src/domain/hook.ts" },
    });
    expect(matchSuccess).toHaveLength(1);

    const matchFail = matcher.match(registry.list(), {
      event: "BeforeEdit",
      payload: { filePath: "docs/readme.md" },
    });
    expect(matchFail).toHaveLength(0);
  });

  it("does not match disabled hooks", () => {
    registry.disable("tool-pre-check");

    const matched = matcher.match(registry.list(), {
      event: "BeforeTool",
      payload: { toolName: "filesystem.write" },
    });

    expect(matched).toHaveLength(0);
    registry.enable("tool-pre-check");
  });
});
