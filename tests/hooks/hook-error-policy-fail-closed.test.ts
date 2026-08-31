import { describe, it, expect } from "vitest";
import { HookManager } from "../../src/hooks/hook-manager.js";

describe("P5.4 Hooks — Error Policies (Fail-Closed vs Fail-Open vs Warn)", () => {
  it("blocks the triggering operation when a fail-closed hook denies or fails", async () => {
    const manager = new HookManager();

    manager.register({
      id: "security-gate",
      name: "Security Gate",
      version: "1.0.0",
      event: "BeforeDeploy",
      action: {
        type: "deny",
        message: "Deployment blocked by security policy.",
      },
      policy: {
        onFailure: "fail-closed",
      },
      priority: 100,
      enabled: true,
      scope: "global",
    });

    const result = await manager.handleEvent({
      event: "BeforeDeploy",
    });

    expect(result.matchedCount).toBe(1);
    expect(result.isBlocked).toBe(true);
    expect(result.results[0]?.decision).toBe("deny");
    expect(result.results[0]?.isFailClosedBlocked).toBe(true);
  });

  it("does not block the triggering operation when a fail-open or warn hook fails", async () => {
    const manager = new HookManager();

    manager.register({
      id: "metrics-tracker",
      name: "Metrics Tracker",
      version: "1.0.0",
      event: "SessionStart",
      action: {
        type: "command",
        command: "invalid_unregistered_command_causing_error",
      },
      policy: {
        onFailure: "fail-open",
      },
      priority: 100,
      enabled: true,
      scope: "global",
    });

    const result = await manager.handleEvent({
      event: "SessionStart",
    });

    expect(result.matchedCount).toBe(1);
    expect(result.isBlocked).toBe(false);
    expect(result.results[0]?.isFailClosedBlocked).toBe(false);
  });
});
