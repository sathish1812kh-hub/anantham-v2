/**
 * Anantham V2 — Hook Recursion & Cascade Guard
 *
 * Enforces strict depth bounds, cycle detection, and fan-out limits to prevent
 * infinite cascades (Hook A -> Event -> Hook A).
 */

export interface HookInvocationFrame {
  hookId: string;
  causationId?: string;
  depth: number;
}

export class HookRecursionGuard {
  private readonly maxDepth: number;
  private readonly maxFanOut: number;
  private readonly activeChains = new Map<string, string[]>(); // causationId -> hookId[]
  private readonly fanOutCounts = new Map<string, number>(); // eventId -> count

  constructor(options?: { maxDepth?: number; maxFanOut?: number }) {
    this.maxDepth = options?.maxDepth || 5;
    this.maxFanOut = options?.maxFanOut || 20;
  }

  /**
   * Checks if a hook invocation is safe to proceed or violates recursion/fan-out bounds.
   */
  public check(
    hookId: string,
    causationId?: string,
    currentDepth: number = 0
  ): { allowed: boolean; reason?: string } {
    // 1. Depth check
    if (currentDepth >= this.maxDepth) {
      return {
        allowed: false,
        reason: `Hook recursion limit exceeded (depth: ${currentDepth} >= max: ${this.maxDepth}).`,
      };
    }

    // 2. Cycle detection within causation chain
    if (causationId) {
      const chain = this.activeChains.get(causationId) || [];
      if (chain.includes(hookId)) {
        return {
          allowed: false,
          reason: `Cyclic hook invocation detected for "${hookId}" in chain [${chain.join(" -> ")}].`,
        };
      }

      // 3. Fan-out check per causation/event
      const currentFanOut = (this.fanOutCounts.get(causationId) || 0) + 1;
      if (currentFanOut > this.maxFanOut) {
        return {
          allowed: false,
          reason: `Hook fan-out limit exceeded (${currentFanOut} > max: ${this.maxFanOut}) for causation "${causationId}".`,
        };
      }
      this.fanOutCounts.set(causationId, currentFanOut);
    }

    return { allowed: true };
  }

  /**
   * Enters an execution frame for a causation chain.
   */
  public enter(hookId: string, causationId?: string): void {
    if (causationId) {
      const chain = this.activeChains.get(causationId) || [];
      chain.push(hookId);
      this.activeChains.set(causationId, chain);
    }
  }

  /**
   * Exits an execution frame.
   */
  public exit(hookId: string, causationId?: string): void {
    if (causationId) {
      const chain = this.activeChains.get(causationId);
      if (chain) {
        const idx = chain.lastIndexOf(hookId);
        if (idx !== -1) {
          chain.splice(idx, 1);
        }
        if (chain.length === 0) {
          this.activeChains.delete(causationId);
          this.fanOutCounts.delete(causationId);
        }
      }
    }
  }

  public reset(): void {
    this.activeChains.clear();
    this.fanOutCounts.clear();
  }
}
