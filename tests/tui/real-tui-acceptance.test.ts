import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Readable } from "node:stream";
import { TuiApplication } from "../../src/tui/tui-application.js";

describe("P8.2 TUI — Real Interactive TUI Acceptance Scenario", () => {
  let app: TuiApplication;

  beforeEach(async () => {
    app = new TuiApplication({ dbPath: ":memory:" });
    await app.initialize();
  });

  afterEach(() => {
    app.shutdown();
  });

  it("simulates interactive TUI session: navigate views 1 -> 2 -> 3 -> ? -> q", async () => {
    const inputChars = ["1", "2", "3", "?", "q"];
    const inStream = Readable.from(inputChars);

    await app.start(inStream);

    expect(app.controller.getCurrentView()).toBe("help");
  });
});
