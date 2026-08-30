import type { ToolObservation } from "../domain/tool.js";

export class IdempotencyStore {
  private readonly store = new Map<string, ToolObservation>();
  private readonly inFlightLocks = new Set<string>();

  private makeKey(projectId: string, toolName: string, idempotencyKey: string): string {
    return `${projectId}::${toolName}::${idempotencyKey}`;
  }

  public get(projectId: string, toolName: string, idempotencyKey: string): ToolObservation | undefined {
    return this.store.get(this.makeKey(projectId, toolName, idempotencyKey));
  }

  public set(
    projectId: string,
    toolName: string,
    idempotencyKey: string,
    observation: ToolObservation
  ): void {
    this.store.set(this.makeKey(projectId, toolName, idempotencyKey), observation);
  }

  public has(projectId: string, toolName: string, idempotencyKey: string): boolean {
    return this.store.has(this.makeKey(projectId, toolName, idempotencyKey));
  }

  public acquireLock(projectId: string, toolName: string, idempotencyKey: string): boolean {
    const key = this.makeKey(projectId, toolName, idempotencyKey);
    if (this.inFlightLocks.has(key)) {
      return false;
    }
    this.inFlightLocks.add(key);
    return true;
  }

  public releaseLock(projectId: string, toolName: string, idempotencyKey: string): void {
    this.inFlightLocks.delete(this.makeKey(projectId, toolName, idempotencyKey));
  }

  public clear(): void {
    this.store.clear();
    this.inFlightLocks.clear();
  }
}
