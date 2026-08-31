import { describe, it, expect } from "vitest";
import { HookManager } from "../../src/hooks/hook-manager.js";

describe("P5.4 Hooks — Project Scoping & Isolation", () => {
  it("isolates project-scoped hooks to their respective project events", async () => {
    const manager = new HookManager();

    manager.register({
      id: "project-alpha-hook",
      name: "Alpha Hook",
      version: "1.0.0",
      event: "SessionStart",
      action: { type: "notify", message: "Hello Alpha" },
      priority: 100,
      enabled: true,
      scope: "project",
      projectId: "prj_alpha",
    });

    manager.register({
      id: "project-beta-hook",
      name: "Beta Hook",
      version: "1.0.0",
      event: "SessionStart",
      action: { type: "notify", message: "Hello Beta" },
      priority: 100,
      enabled: true,
      scope: "project",
      projectId: "prj_beta",
    });

    // Event for Alpha
    const alphaResult = await manager.handleEvent({
      event: "SessionStart",
      projectId: "prj_alpha",
    });
    expect(alphaResult.matchedCount).toBe(1);
    expect(alphaResult.results[0]?.hookId).toBe("project-alpha-hook");

    // Event for Beta
    const betaResult = await manager.handleEvent({
      event: "SessionStart",
      projectId: "prj_beta",
    });
    expect(betaResult.matchedCount).toBe(1);
    expect(betaResult.results[0]?.hookId).toBe("project-beta-hook");
  });
});
