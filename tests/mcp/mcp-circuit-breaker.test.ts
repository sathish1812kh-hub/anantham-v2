import { describe, it, expect } from "vitest";
import { MCPCircuitBreaker } from "../../src/mcp/mcp-circuit-breaker.js";

describe("P5.1 MCP Circuit Breaker — 3-State Resilience", () => {
  it("transitions from CLOSED to OPEN after failure threshold", () => {
    const breaker = new MCPCircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 50,
    });

    expect(breaker.getState()).toBe("closed");
    expect(breaker.canExecute()).toBe(true);

    // First failure
    breaker.recordFailure();
    expect(breaker.getState()).toBe("closed");

    // Second failure -> Trips to OPEN
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");
    expect(breaker.isOpen()).toBe(true);
    expect(breaker.canExecute()).toBe(false);
  });

  it("transitions from OPEN to HALF_OPEN after cooldown and resets on success", async () => {
    const breaker = new MCPCircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 20,
    });

    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);

    // Wait for cooldown
    await new Promise((res) => setTimeout(res, 30));

    expect(breaker.getState()).toBe("half_open");
    expect(breaker.canExecute()).toBe(true); // Probe allowed

    // Success resets to closed
    breaker.recordSuccess();
    expect(breaker.getState()).toBe("closed");
    expect(breaker.getConsecutiveFailures()).toBe(0);
  });
});
