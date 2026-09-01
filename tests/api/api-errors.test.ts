import { describe, it, expect } from "vitest";
import { ApiErrorMapper } from "../../src/api/api-error-mapper.js";

describe("P8.3 API — Error Classification Mapping", () => {
  it("maps unauthorized error to 401 UNAUTHORIZED", () => {
    const res = ApiErrorMapper.mapError(new Error("Missing token or unauthorized actor"));
    expect(res.statusCode).toBe(401);
    expect(res.response.error.classification).toBe("UNAUTHORIZED");
  });

  it("maps forbidden error to 403 FORBIDDEN", () => {
    const res = ApiErrorMapper.mapError(new Error("Forbidden: Cross-project boundary violation"));
    expect(res.statusCode).toBe(403);
    expect(res.response.error.classification).toBe("FORBIDDEN");
  });

  it("maps not found error to 404 NOT_FOUND", () => {
    const res = ApiErrorMapper.mapError(new Error("Task not found"));
    expect(res.statusCode).toBe(404);
    expect(res.response.error.classification).toBe("NOT_FOUND");
  });

  it("maps conflict error to 409 LEASE_FENCING_ERROR", () => {
    const res = ApiErrorMapper.mapError(new Error("Fencing token conflict: stale lease generation"));
    expect(res.statusCode).toBe(409);
    expect(res.response.error.classification).toBe("LEASE_FENCING_ERROR");
  });

  it("maps validation error to 400 VALIDATION_ERROR", () => {
    const res = ApiErrorMapper.mapError(new Error("Validation Error: Missing required field"));
    expect(res.statusCode).toBe(400);
    expect(res.response.error.classification).toBe("VALIDATION_ERROR");
  });
});
