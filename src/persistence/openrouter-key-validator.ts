/**
 * Anantham V2 / Antigravity CLI Harness — OpenRouter Key Validation Handshake
 * Validates API key authenticity and parses account metadata before persistence.
 */

export interface OpenRouterKeyMetadata {
  label: string;
  limit: number | null;
  usage: number;
  is_free_tier: boolean;
  rateLimit?: {
    requests?: number;
    interval?: string;
  };
}

export interface OpenRouterKeyValidationResult {
  valid: boolean;
  metadata?: OpenRouterKeyMetadata;
  error?: string;
  status?: number;
}

export interface KeyValidationOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  referer?: string;
  title?: string;
  signal?: AbortSignal;
}

export const DEFAULT_OPENROUTER_REFERER = "https://github.com/antigravity/cli";
export const DEFAULT_OPENROUTER_TITLE = "Antigravity CLI";
export const OPENROUTER_AUTH_KEY_ENDPOINT = "https://openrouter.ai/api/v1/auth/key";

interface RawAuthKeyEnvelope {
  error?: {
    message?: string;
    code?: number | string;
    [key: string]: unknown;
  } | string;
  data?: {
    error?: {
      message?: string;
      code?: number | string;
      [key: string]: unknown;
    } | string;
    label?: string;
    name?: string;
    limit?: number | null;
    usage?: number;
    is_free_tier?: boolean;
    rate_limit?: {
      requests?: number;
      interval?: string;
    };
  };
  label?: string;
  name?: string;
  limit?: number | null;
  usage?: number;
  is_free_tier?: boolean;
  rate_limit?: {
    requests?: number;
    interval?: string;
  };
}

/**
 * Validates an OpenRouter API key against the auth key verification endpoint.
 *
 * Headers required:
 * - Authorization: Bearer <API_KEY>
 * - HTTP-Referer: https://github.com/antigravity/cli
 * - X-Title: Antigravity CLI
 */
export async function validateOpenRouterKey(
  apiKey: string,
  options?: KeyValidationOptions
): Promise<OpenRouterKeyValidationResult> {
  const trimmedKey = apiKey ? apiKey.trim() : "";
  if (!trimmedKey) {
    return {
      valid: false,
      error: "API key cannot be empty or invalid",
    };
  }

  const timeoutMs = options?.timeoutMs ?? 10_000;
  const referer = options?.referer ?? DEFAULT_OPENROUTER_REFERER;
  const title = options?.title ?? DEFAULT_OPENROUTER_TITLE;
  const fetchImpl = options?.fetchFn ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    return {
      valid: false,
      error: "Fetch API is unavailable in current runtime environment",
    };
  }

  if (options?.signal?.aborted) {
    return {
      valid: false,
      error: "OpenRouter key validation aborted by caller",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (options?.signal) {
    options.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_AUTH_KEY_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${trimmedKey}`,
        "HTTP-Referer": referer,
        "X-Title": title,
      },
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError" || controller.signal.aborted) {
      if (options?.signal?.aborted) {
        return {
          valid: false,
          error: "OpenRouter key validation aborted by caller",
        };
      }
      return {
        valid: false,
        error: `Network timeout validating OpenRouter key (${timeoutMs}ms exceeded)`,
      };
    }
    return {
      valid: false,
      error: `Network error validating OpenRouter key: ${err?.message || String(err)}`,
    };
  } finally {
    clearTimeout(timeoutId);
    if (options?.signal) {
      options.signal.removeEventListener("abort", onExternalAbort);
    }
  }

  if (!response || typeof response.status !== "number") {
    return {
      valid: false,
      error: "No response received from OpenRouter auth API",
    };
  }

  if (response.status === 401) {
    return {
      valid: false,
      status: 401,
      error: "Invalid or revoked OpenRouter API key",
    };
  }

  if (response.status === 403) {
    return {
      valid: false,
      status: 403,
      error: "OpenRouter API key lacks required permissions",
    };
  }

  if (response.status === 429) {
    return {
      valid: false,
      status: 429,
      error: "OpenRouter rate limit exceeded during validation",
    };
  }

  if (!response.ok) {
    return {
      valid: false,
      status: response.status,
      error: `OpenRouter authentication service returned HTTP ${response.status}: ${response.statusText || "Error"}`,
    };
  }

  let json: RawAuthKeyEnvelope;
  try {
    json = (await response.json()) as RawAuthKeyEnvelope;
  } catch {
    return {
      valid: false,
      status: response.status,
      error: "Invalid JSON response from OpenRouter auth API",
    };
  }

  if (!json || typeof json !== "object") {
    return {
      valid: false,
      status: response.status,
      error: "Invalid JSON response payload from OpenRouter auth API",
    };
  }

  // Handle HTTP 200 error payloads (e.g. { error: { message: "..." } } or { data: { error: "..." } })
  const errorObj = (json as any).error ?? (json as any).data?.error;
  if (errorObj) {
    const errorMessage =
      typeof errorObj === "string"
        ? errorObj
        : typeof errorObj === "object" && typeof errorObj?.message === "string"
          ? errorObj.message
          : "OpenRouter authentication failed with error payload";
    return {
      valid: false,
      status: response.status,
      error: errorMessage,
    };
  }

  // Parse metadata from either { data: { ... } } envelope or top-level fields
  const payload = json.data && typeof json.data === "object" ? json.data : json;
  const label = typeof payload.label === "string" && payload.label
    ? payload.label
    : (typeof payload.name === "string" && payload.name ? payload.name : "Default Key");

  let limit: number | null = null;
  if (payload.limit !== undefined && payload.limit !== null) {
    const num = Number(payload.limit);
    limit = Number.isNaN(num) ? null : num;
  }

  let usage = 0;
  if (payload.usage !== undefined && payload.usage !== null) {
    const num = Number(payload.usage);
    usage = Number.isNaN(num) ? 0 : num;
  }

  const is_free_tier = Boolean(payload.is_free_tier);

  let rateLimit: { requests?: number; interval?: string } | undefined;
  if (payload.rate_limit && typeof payload.rate_limit === "object") {
    rateLimit = {
      requests: typeof payload.rate_limit.requests === "number" ? payload.rate_limit.requests : undefined,
      interval: typeof payload.rate_limit.interval === "string" ? payload.rate_limit.interval : undefined,
    };
  }

  return {
    valid: true,
    status: response.status,
    metadata: {
      label,
      limit,
      usage,
      is_free_tier,
      ...(rateLimit ? { rateLimit } : {}),
    },
  };
}
