import { describe, it, expect, vi } from "vitest";
import { Writable } from "node:stream";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiController } from "../../src/tui/tui-controller.js";

describe("P8.2 TUI — Render Coalescing & Event Storm Resistance", () => {
  it("coalesces 50 rapid render requests into a single debounced redraw", async () => {
    const adapter = new TuiStateAdapter();
    const renderer = new TuiRenderer();
    let writeCount = 0;

    const outStream = new Writable({
      write(_chunk, _enc, cb) {
        writeCount++;
        cb();
      },
    });

    const controller = new TuiController({
      stateAdapter: adapter,
      renderer,
      output: outStream,
      coalesceIntervalMs: 25,
    });
    controller.start();

    // Reset initial start write count
    writeCount = 0;

    // Fire 50 rapid render requests
    for (let i = 0; i < 50; i++) {
      controller.requestRender();
    }

    expect(writeCount).toBe(0); // Debounced

    // Wait for coalesce window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(writeCount).toBe(1); // Coalesced into 1 frame

    controller.stop();
  });
});
