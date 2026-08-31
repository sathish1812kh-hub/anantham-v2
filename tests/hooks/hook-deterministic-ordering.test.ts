import { describe, it, expect } from "vitest";
import { HookRegistry } from "../../src/hooks/hook-registry.js";
import { HookMatcher } from "../../src/hooks/hook-matcher.js";

describe("P5.4 Hooks — Deterministic Priority & Stable Ordering", () => {
  const registry = new HookRegistry();
  const matcher = new HookMatcher();

  registry.register({
    id: "low-priority-hook",
    name: "Low Priority",
    version: "1.0.0",
    event: "SessionStart",
    action: { type: "notify", message: "Low" },
    priority: 50,
    enabled: true,
    scope: "global",
  });

  registry.register({
    id: "high-priority-hook",
    name: "High Priority",
    version: "1.0.0",
    event: "SessionStart",
    action: { type: "notify", message: "High" },
    priority: 200,
    enabled: true,
    scope: "global",
  });

  registry.register({
    id: "medium-priority-hook-b",
    name: "Medium Priority B",
    version: "1.0.0",
    event: "SessionStart",
    action: { type: "notify", message: "Medium B" },
    priority: 100,
    enabled: true,
    scope: "global",
  });

  registry.register({
    id: "medium-priority-hook-a",
    name: "Medium Priority A",
    version: "1.0.0",
    event: "SessionStart",
    action: { type: "notify", message: "Medium A" },
    priority: 100,
    enabled: true,
    scope: "global",
  });

  it("orders matched candidate hooks by priority descending, then stable ID ascending", () => {
    const matched = matcher.match(registry.list(), { event: "SessionStart" });

    expect(matched).toHaveLength(4);
    expect(matched[0]?.id).toBe("high-priority-hook");
    expect(matched[1]?.id).toBe("medium-priority-hook-a");
    expect(matched[2]?.id).toBe("medium-priority-hook-b");
    expect(matched[3]?.id).toBe("low-priority-hook");
  });
});
