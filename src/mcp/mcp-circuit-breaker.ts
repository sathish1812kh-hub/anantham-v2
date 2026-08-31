/**
 * Anantham V2 — MCP Circuit Breaker
 *
 * Implements deterministic 3-state circuit breaker (CLOSED -> OPEN -> HALF_OPEN)
 * to protect the runtime from failing MCP servers and prevent cascading connection storms.
 */

export interface MCPCircuitBreakerOptions {
  failureThreshold?: number; // Consecutive failures before tripping (default 3)
  cooldownMs?: number;       // Time in ms before probing half-open (default 10000ms)
  halfOpenMaxProbes?: number; // Max probes allowed in half-open state (default 1)
  onStateChange?: (newState: "closed" | "open" | "half_open", previousState: "closed" | "open" | "half_open") => void;
}

export class MCPCircuitBreaker {
  private state: "closed" | "open" | "half_open" = "closed";
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly halfOpenMaxProbes: number;
  private activeProbes = 0;
  private readonly onStateChange?: (newState: "closed" | "open" | "half_open", previousState: "closed" | "open" | "half_open") => void;

  constructor(options: MCPCircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold || 3;
    this.cooldownMs = options.cooldownMs || 10000;
    this.halfOpenMaxProbes = options.halfOpenMaxProbes || 1;
    this.onStateChange = options.onStateChange;
  }

  public getState(): "closed" | "open" | "half_open" {
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.cooldownMs) {
        this.transitionTo("half_open");
      }
    }
    return this.state;
  }

  public isOpen(): boolean {
    return this.getState() === "open";
  }

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  public getCooldownRemainingMs(): number {
    if (this.state !== "open") return 0;
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.cooldownMs - elapsed);
  }

  public canExecute(): boolean {
    const currentState = this.getState();
    if (currentState === "closed") {
      return true;
    }
    if (currentState === "half_open") {
      if (this.activeProbes < this.halfOpenMaxProbes) {
        this.activeProbes++;
        return true;
      }
      return false;
    }
    return false;
  }

  public recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.activeProbes = 0;
    if (this.state !== "closed") {
      this.transitionTo("closed");
    }
  }

  public recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.activeProbes = 0;

    if (this.state === "closed" && this.consecutiveFailures >= this.failureThreshold) {
      this.transitionTo("open");
    } else if (this.state === "half_open") {
      this.transitionTo("open");
    }
  }

  public reset(): void {
    this.consecutiveFailures = 0;
    this.activeProbes = 0;
    this.lastFailureTime = 0;
    this.transitionTo("closed");
  }

  private transitionTo(newState: "closed" | "open" | "half_open"): void {
    if (this.state !== newState) {
      const previous = this.state;
      this.state = newState;
      this.onStateChange?.(newState, previous);
    }
  }
}
