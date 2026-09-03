import { describe, it, expect } from "vitest";
import { OpenApiSpecGenerator } from "../../src/api/openapi-spec-generator.js";

describe("PRD-PART2-307: OpenAPI / Swagger API Documentation & Schema Validation", () => {
  it("generates OpenAPI 3.1 valid JSON specification containing paths, operations, and schemas", () => {
    const generator = new OpenApiSpecGenerator("Anantham Test API", "2.0.0");

    generator.registerRoute({
      path: "/api/v2/custom",
      method: "GET",
      summary: "Custom endpoint",
    });

    const spec: any = generator.generateSpecJson();
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Anantham Test API");
    expect(spec.paths["/api/v2/sessions"]).toBeDefined();
    expect(spec.paths["/api/v2/tools/execute"]).toBeDefined();
    expect(spec.paths["/api/v2/custom"]?.get).toBeDefined();
  });
});
