import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import { TuiStateAdapter } from "../../src/tui/tui-state-adapter.js";
import { TuiRenderer } from "../../src/tui/tui-renderer.js";
import { TuiController } from "../../src/tui/tui-controller.js";

describe("P8.2 TUI — Keyboard Navigation & View Switching", () => {
  let adapter: TuiStateAdapter;
  let renderer: TuiRenderer;
  let controller: TuiController;
  let outData: string;

  beforeEach(() => {
    adapter = new TuiStateAdapter();
    renderer = new TuiRenderer();
    outData = "";

    const outStream = new Writable({
      write(chunk, _enc, cb) {
        outData += chunk.toString();
        cb();
      },
    });

    controller = new TuiController({
      stateAdapter: adapter,
      renderer,
      output: outStream,
      coalesceIntervalMs: 0,
    });
    controller.start();
  });

  afterEach(() => {
    controller.stop();
  });

  it("switches views via number keys 1 through 9", async () => {
    expect(controller.getCurrentView()).toBe("dashboard");

    await controller.handleInput("2");
    expect(controller.getCurrentView()).toBe("session");

    await controller.handleInput("3");
    expect(controller.getCurrentView()).toBe("tasks");

    await controller.handleInput("4");
    expect(controller.getCurrentView()).toBe("workflows");

    await controller.handleInput("5");
    expect(controller.getCurrentView()).toBe("agents");

    await controller.handleInput("6");
    expect(controller.getCurrentView()).toBe("jobs");

    await controller.handleInput("7");
    expect(controller.getCurrentView()).toBe("nodes");

    await controller.handleInput("8");
    expect(controller.getCurrentView()).toBe("approvals");

    await controller.handleInput("9");
    expect(controller.getCurrentView()).toBe("events");

    await controller.handleInput("?");
    expect(controller.getCurrentView()).toBe("help");
  });

  it("stops on 'q' or ESC", async () => {
    const keepRunning = await controller.handleInput("q");
    expect(keepRunning).toBe(false);
  });
});
