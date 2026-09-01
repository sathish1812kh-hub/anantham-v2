import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Readable, Writable } from "node:stream";
import { CliApplication } from "../../src/cli/cli-application.js";

describe("P8.1 CLI — Real Interactive REPL Acceptance Scenario", () => {
  let app: CliApplication;

  beforeEach(async () => {
    app = new CliApplication({
      dbPath: ":memory:",
      outputMode: "text",
    });
    await app.initialize();
  });

  afterEach(() => {
    app.shutdown();
  });

  it("simulates full interactive REPL session: create project -> create session -> create task -> doctor -> exit", async () => {
    const inputLines = [
      '/project create "E2E Acceptance Project"',
      '/session create "Interactive REPL Session"',
      '/task create "Verify CLI interactive loop"',
      '/doctor',
      '/exit',
    ];

    let outputData = "";

    const inputStream = Readable.from(inputLines.map((l) => l + "\n"));

    // Create Writable stream that captures terminal output
    const outputStream = new Writable({
      write(chunk, _encoding, callback) {
        outputData += chunk.toString();
        callback();
      },
    });

    await app.startInteractive(inputStream, outputStream);

    expect(outputData).toContain("✔ Created and selected project");
    expect(outputData).toContain("✔ Created and selected session");
    expect(outputData).toContain("✔ Created task");
    expect(outputData).toContain("✔ System Health Diagnostics");
    expect(outputData).toContain("✔ Exiting Anantham session loop");
  });
});
