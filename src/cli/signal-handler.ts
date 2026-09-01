export type CancellationCallback = (reason: string) => Promise<void> | void;

/**
 * CLI Signal & Cancellation Handler.
 * Manages SIGINT/SIGTERM process signals and coordinates graceful runtime cancellation.
 * PRD Part 2 Section 176.
 */
export class SignalHandler {
  private cancellationCallbacks: Set<CancellationCallback> = new Set();
  private isCancelling = false;
  private sigintCount = 0;
  private attached = false;

  public registerCancellationCallback(cb: CancellationCallback): () => void {
    this.cancellationCallbacks.add(cb);
    return () => {
      this.cancellationCallbacks.delete(cb);
    };
  }

  public attach(): void {
    if (this.attached) return;
    this.attached = true;

    process.on("SIGINT", this.handleSigint);
    process.on("SIGTERM", this.handleSigterm);
  }

  public detach(): void {
    if (!this.attached) return;
    this.attached = false;

    process.removeListener("SIGINT", this.handleSigint);
    process.removeListener("SIGTERM", this.handleSigterm);
  }

  public async triggerCancellation(reason = "SIGINT signal received"): Promise<void> {
    if (this.isCancelling) return;
    this.isCancelling = true;

    for (const cb of this.cancellationCallbacks) {
      try {
        await cb(reason);
      } catch {
        // Suppress cancellation callback errors to ensure all handlers run
      }
    }

    this.isCancelling = false;
  }

  private handleSigint = async () => {
    this.sigintCount++;
    if (this.sigintCount === 1) {
      console.log("\n[Anantham] Cancellation requested (Ctrl+C). Press again to force exit.");
      await this.triggerCancellation("User interrupted (SIGINT)");
    } else {
      console.log("\n[Anantham] Forcing immediate shutdown.");
      process.exit(130);
    }
  };

  private handleSigterm = async () => {
    console.log("\n[Anantham] Terminating (SIGTERM).");
    await this.triggerCancellation("Process terminated (SIGTERM)");
    process.exit(143);
  };
}
