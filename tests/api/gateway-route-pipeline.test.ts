import { describe, it, expect } from "vitest";
import { GatewayRoutePipeline } from "../../src/api/gateway-route-pipeline.js";

describe("PRD-API-001: Authoritative Gateway Route Registry & Middleware Pipeline", () => {
  it("routes incoming requests through middleware pipeline to registered route handler", async () => {
    const pipeline = new GatewayRoutePipeline();
    const trace: string[] = [];

    // Middleware 1: Logging
    pipeline.use(async (req, res, next) => {
      trace.push("logger_in");
      await next();
      trace.push("logger_out");
    });

    // Middleware 2: Auth check
    pipeline.use(async (req, res, next) => {
      if (!req.headers["authorization"]) {
        res.statusCode = 401;
        res.body = { error: "Unauthorized" };
        return;
      }
      trace.push("auth_ok");
      await next();
    });

    // Register route
    pipeline.register("GET", "/health", async () => {
      trace.push("handler");
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: { status: "healthy" },
      };
    });

    // 1. Unauthorized request
    const unauthRes = await pipeline.dispatch({
      path: "/health",
      method: "GET",
      headers: {},
    });
    expect(unauthRes.statusCode).toBe(401);
    expect(unauthRes.body).toEqual({ error: "Unauthorized" });

    // 2. Authorized request
    trace.length = 0;
    const authRes = await pipeline.dispatch({
      path: "/health",
      method: "GET",
      headers: { authorization: "Bearer token123" },
    });
    expect(authRes.statusCode).toBe(200);
    expect(authRes.body).toEqual({ status: "healthy" });
    expect(trace).toEqual(["logger_in", "auth_ok", "handler", "logger_out"]);

    // 3. Not Found
    const notFoundRes = await pipeline.dispatch({
      path: "/nonexistent",
      method: "GET",
      headers: { authorization: "Bearer token123" },
    });
    expect(notFoundRes.statusCode).toBe(404);
  });
});
