import { describe, it, expect } from "vitest";
import { SignalHandler } from "../../src/cli/signal-handler.js";

describe("P8.1 CLI — Signal & Cancellation Handling", () => {
  it("registers and triggers cancellation callbacks", async () => {
    const handler = new SignalHandler();
    let cancelledReason = "";

    const unregister = handler.registerCancellationCallback((reason) => {
      cancelledReason = reason;
    });

    await handler.triggerCancellation("User pressed Ctrl+C");
    expect(cancelledReason).toBe("User pressed Ctrl+C");

    unregister();
    cancelledReason = "";
    await handler.triggerCancellation("Second cancel");
    expect(cancelledReason).toBe(""); // Unregistered
  });
});
