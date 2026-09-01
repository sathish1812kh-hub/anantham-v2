/**
 * In-memory / durable Idempotency Manager for mutating REST operations.
 * PRD Part 2 Section 205.
 */
export interface CachedResponse {
  statusCode: number;
  responseBody: unknown;
  timestamp: string;
}

export class ApiIdempotencyManager {
  private readonly cache = new Map<string, CachedResponse>();
  private readonly ttlMs: number;

  constructor(options: { ttlMs?: number } = {}) {
    this.ttlMs = options.ttlMs ?? 300_000; // 5 minutes default
  }

  public get(key: string): CachedResponse | undefined {
    const cached = this.cache.get(key);
    if (!cached) return undefined;

    const age = Date.now() - new Date(cached.timestamp).getTime();
    if (age > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return cached;
  }

  public set(key: string, statusCode: number, responseBody: unknown): void {
    this.cache.set(key, {
      statusCode,
      responseBody,
      timestamp: new Date().toISOString(),
    });
  }

  public clear(): void {
    this.cache.clear();
  }
}
