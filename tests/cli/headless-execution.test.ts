import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CliApplication } from "../../src/cli/cli-application.js";

describe("P8.1 CLI — Headless & Scripted Execution", () => {
  let app: CliApplication;

  beforeEach(async () => {
    app = new CliApplication({
      dbPath: ":memory:",
      outputMode: "json",
    });
    await app.initialize();
  });

  afterEach(() => {
    app.shutdown();
  });

  it("executes single commands in headless mode and outputs structured results", async () => {
    const res = await app.executeSingleCommand("/doctor");
    expect(res.success).toBe(true);
    expect(res.commandName).toBe("doctor");

    const jsonStr = app.renderer.renderResult(res);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.success).toBe(true);
    expect(parsed.data.sqliteWal).toBe("HEALTHY");
  });

  it("handles headless command failures with structured classified errors", async () => {
    // Attempt task list before selecting a project
    const res = await app.executeSingleCommand("/task list");
    expect(res.success).toBe(false);
    expect(res.classification).toBe("NOT_FOUND");
  });
});
