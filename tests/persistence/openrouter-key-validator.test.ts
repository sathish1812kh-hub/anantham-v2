import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateOpenRouterKey,
  DEFAULT_OPENROUTER_REFERER,
  DEFAULT_OPENROUTER_TITLE,
  OPENROUTER_AUTH_KEY_ENDPOINT,
} from "../../src/persistence/openrouter-key-validator.js";

describe("OpenRouterKeyValidator", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("successfully validates a valid OpenRouter API key and extracts metadata (200 OK with data envelope)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          label: "Team Production Key",
          limit: 150,
          usage: 42.125,
          is_free_tier: false,
          rate_limit: {
            requests: 200,
            interval: "10s",
          },
        },
      }),
    } as unknown as Response);

    const result = await validateOpenRouterKey("sk-or-v1-validkey12345678", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      OPENROUTER_AUTH_KEY_ENDPOINT,
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer sk-or-v1-validkey12345678",
          "HTTP-Referer": DEFAULT_OPENROUTER_REFERER,
          "X-Title": DEFAULT_OPENROUTER_TITLE,
        },
      })
    );

    expect(result.valid).toBe(true);
    expect(result.status).toBe(200);
    expect(result.metadata).toEqual({
      label: "Team Production Key",
      limit: 150,
      usage: 42.125,
      is_free_tier: false,
      rateLimit: {
        requests: 200,
        interval: "10s",
      },
    });
  });

  it("handles flat JSON payload without data envelope and null limit (unlimited)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: "Personal Dev Key",
        limit: null,
        usage: 0.05,
        is_free_tier: true,
      }),
    } as unknown as Response);

    const result = await validateOpenRouterKey("sk-or-v1-flatkey987654", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.valid).toBe(true);
    expect(result.metadata?.label).toBe("Personal Dev Key");
    expect(result.metadata?.limit).toBeNull();
    expect(result.metadata?.usage).toBe(0.05);
    expect(result.metadata?.is_free_tier).toBe(true);
  });

  it("rejects empty or whitespace-only keys without firing HTTP requests", async () => {
    const mockFetch = vi.fn();

    const resultEmpty = await validateOpenRouterKey("", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    expect(resultEmpty.valid).toBe(false);
    expect(resultEmpty.error).toContain("empty");

    const resultWhitespace = await validateOpenRouterKey("    ", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    expect(resultWhitespace.valid).toBe(false);
    expect(resultWhitespace.error).toContain("empty");

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles 401 Unauthorized with descriptive invalid key message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as unknown as Response);

    const result = await validateOpenRouterKey("sk-or-v1-revokedkey", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.valid).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toContain("Invalid or revoked");
  });

  it("handles 403 Forbidden with permission message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    } as unknown as Response);

    const result = await validateOpenRouterKey("sk-or-v1-nopermkey", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.valid).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toContain("permissions");
  });

  it("handles 429 Too Many Requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as unknown as Response);

    const result = await validateOpenRouterKey("sk-or-v1-ratelimited", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.valid).toBe(false);
    expect(result.status).toBe(429);
    expect(result.error).toContain("rate limit");
  });

  it("handles non-JSON response from server", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("Unexpected token < in JSON at position 0");
      },
    } as unknown as Response);

    const result = await validateOpenRouterKey("sk-or-v1-badjson", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid JSON");
  });

  it("handles network timeout / AbortError gracefully", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";

    const mockFetch = vi.fn().mockRejectedValue(abortErr);

    const result = await validateOpenRouterKey("sk-or-v1-timeoutkey", {
      fetchFn: mockFetch as unknown as typeof fetch,
      timeoutMs: 2000,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Network timeout");
  });

  it("respects custom referer and title options", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ label: "Custom Header Key" }),
    } as unknown as Response);

    await validateOpenRouterKey("sk-or-v1-customheaders", {
      fetchFn: mockFetch as unknown as typeof fetch,
      referer: "https://custom.app",
      title: "Custom CLI",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      OPENROUTER_AUTH_KEY_ENDPOINT,
      expect.objectContaining({
        headers: expect.objectContaining({
          "HTTP-Referer": "https://custom.app",
          "X-Title": "Custom CLI",
        }),
      })
    );
  });

  it("rejects HTTP 200 responses containing an error envelope object", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          message: "API key has been disabled by administrator",
          code: 403,
        },
      }),
    } as unknown as Response);

    const result = await validateOpenRouterKey("sk-or-v1-disabledkey", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.valid).toBe(false);
    expect(result.status).toBe(200);
    expect(result.error).toBe("API key has been disabled by administrator");
  });

  it("rejects HTTP 200 responses containing a flat string error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: "Unauthorized user account",
      }),
    } as unknown as Response);

    const result = await validateOpenRouterKey("sk-or-v1-stringerrorkey", {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.valid).toBe(false);
    expect(result.status).toBe(200);
    expect(result.error).toBe("Unauthorized user account");
  });

  it("supports cancellation via external AbortSignal in options", async () => {
    const abortController = new AbortController();
    abortController.abort();

    const mockFetch = vi.fn();

    const result = await validateOpenRouterKey("sk-or-v1-aborttest", {
      fetchFn: mockFetch as unknown as typeof fetch,
      signal: abortController.signal,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("aborted by caller");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("cancels in-flight validation when external AbortSignal fires during request", async () => {
    const abortController = new AbortController();
    const mockFetch = vi.fn().mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const promise = validateOpenRouterKey("sk-or-v1-inflightabort", {
      fetchFn: mockFetch as unknown as typeof fetch,
      signal: abortController.signal,
    });

    setTimeout(() => abortController.abort(), 10);

    const result = await promise;
    expect(result.valid).toBe(false);
    expect(result.error).toContain("aborted by caller");
  });
});
