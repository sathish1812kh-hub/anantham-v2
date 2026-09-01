/**
 * In-memory / durable Idempotency Manager for mutating REST operations.
 * PRD Part 2 Section 205.
 */
export interface CachedResponse {
  statusCode: number;
  responseBody: unknown;
  timestamp: string;
  method?: string;
  pathname?: string;
  bodyHash?: string;
}

export interface RequestIdempotencyContext {
  method: string;
  pathname: string;
  bodyHash?: string;
}

export class IdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export class ApiIdempotencyManager {
  private readonly cache = new Map<string, CachedResponse>();
  private readonly ttlMs: number;

  constructor(options: { ttlMs?: number } = {}) {
    this.ttlMs = options.ttlMs ?? 300_000; // 5 minutes default
  }

  public get(key: string, context?: RequestIdempotencyContext): CachedResponse | undefined {
    const cached = this.cache.get(key);
    if (!cached) return undefined;

    const age = Date.now() - new Date(cached.timestamp).getTime();
    if (age > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    if (context && cached.method && cached.pathname) {
      const methodMatch = cached.method === context.method;
      const pathMatch = cached.pathname === context.pathname;
      const bodyMatch = !cached.bodyHash || !context.bodyHash || cached.bodyHash === context.bodyHash;

      if (!methodMatch || !pathMatch || !bodyMatch) {
        throw new IdempotencyConflictError(
          `Idempotency-Key '${key}' is already bound to a different request (${cached.method} ${cached.pathname}).`
        );
      }
    }

    return cached;
  }

  public set(
    key: string,
    statusCode: number,
    responseBody: unknown,
    context?: RequestIdempotencyContext
  ): void {
    this.cache.set(key, {
      statusCode,
      responseBody,
      timestamp: new Date().toISOString(),
      method: context?.method,
      pathname: context?.pathname,
      bodyHash: context?.bodyHash,
    });
  }

  public clear(): void {
    this.cache.clear();
  }
}
