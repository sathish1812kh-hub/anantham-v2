import { describe, it, expect } from "vitest";
import { HookRecursionGuard } from "../../src/hooks/hook-recursion-guard.js";
import { HookManager } from "../../src/hooks/hook-manager.js";

describe("P5.4 Hooks — Recursion & Cyclic Cascade Protection", () => {
  it("detects and blocks direct recursion when depth exceeds max allowed limit", () => {
    const guard = new HookRecursionGuard({ maxDepth: 3 });

    expect(guard.check("hook_a", "cause_1", 0).allowed).toBe(true);
    expect(guard.check("hook_a", "cause_1", 1).allowed).toBe(true);
    expect(guard.check("hook_a", "cause_1", 2).allowed).toBe(true);
    expect(guard.check("hook_a", "cause_1", 3).allowed).toBe(false);
  });

  it("detects and blocks cyclic invocation (A -> B -> A) within the same causation chain", () => {
    const guard = new HookRecursionGuard();

    guard.enter("hook_a", "cause_cyclic");
    guard.enter("hook_b", "cause_cyclic");

    const cyclicCheck = guard.check("hook_a", "cause_cyclic", 2);
    expect(cyclicCheck.allowed).toBe(false);
    expect(cyclicCheck.reason).toContain("Cyclic hook invocation");

    guard.exit("hook_b", "cause_cyclic");
    guard.exit("hook_a", "cause_cyclic");
  });

  it("safely skips recursive hook execution inside HookManager", async () => {
    const recursionGuard = new HookRecursionGuard({ maxDepth: 2 });
    const manager = new HookManager({ recursionGuard });

    manager.register({
      id: "cascading-hook",
      name: "Cascading Hook",
      version: "1.0.0",
      event: "PromptSubmit",
      action: { type: "allow" },
      priority: 100,
      enabled: true,
      scope: "global",
    });

    const result = await manager.handleEvent({
      event: "PromptSubmit",
      depth: 3, // exceeds limit
    });

    expect(result.matchedCount).toBe(1);
    expect(result.results[0]?.decision).toBe("skipped");
    expect(result.results[0]?.error).toContain("Hook recursion limit exceeded");
  });
});
