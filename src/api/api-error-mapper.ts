import { type ApiErrorResponse, ApiErrorResponseSchema } from "../domain/api.js";

/**
 * Standardized HTTP Error Mapper preserving runtime classifications.
 * PRD Part 1 Section 60 & PRD Part 2 Section 200.
 */
export class ApiErrorMapper {
  /**
   * Map any caught error to HTTP status code and structured response envelope.
   */
  public static mapError(error: unknown): { statusCode: number; response: ApiErrorResponse } {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    let statusCode = 500;
    let classification = "INTERNAL_ERROR";
    let code = "internal_server_error";

    if (lower.includes("unauthorized") || lower.includes("unauthenticated") || lower.includes("missing token")) {
      statusCode = 401;
      classification = "UNAUTHORIZED";
      code = "unauthorized";
    } else if (lower.includes("forbidden") || lower.includes("boundary violation") || lower.includes("policy denial")) {
      statusCode = 403;
      classification = "FORBIDDEN";
      code = "forbidden";
    } else if (lower.includes("not found") || lower.includes("does not exist") || lower.includes("no active")) {
      statusCode = 404;
      classification = "NOT_FOUND";
      code = "not_found";
    } else if (lower.includes("idempotency")) {
      statusCode = 409;
      classification = "IDEMPOTENCY_CONFLICT";
      code = "conflict";
    } else if (lower.includes("fencing") || lower.includes("stale") || lower.includes("conflict")) {
      statusCode = 409;
      classification = "LEASE_FENCING_ERROR";
      code = "conflict";
    } else if (
      lower.includes("validation") ||
      lower.includes("invalid") ||
      lower.includes("schema") ||
      lower.includes("required") ||
      lower.includes("too_small") ||
      lower.includes("too_big") ||
      lower.includes("invalid_type")
    ) {
      statusCode = 400;
      classification = "VALIDATION_ERROR";
      code = "bad_request";
    } else if (lower.includes("rate limit") || lower.includes("too many requests")) {
      statusCode = 429;
      classification = "RATE_LIMITED";
      code = "too_many_requests";
    }

    const response = ApiErrorResponseSchema.parse({
      success: false,
      error: {
        code,
        message,
        classification,
      },
    });

    return { statusCode, response };
  }
}
