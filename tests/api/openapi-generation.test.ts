import { describe, it, expect } from "vitest";
import { OpenApiGenerator } from "../../src/api/openapi-generator.js";

describe("P8.3 API — OpenAPI 3.1 Specification Generator", () => {
  it("generates valid OpenAPI 3.1.0 document with expected paths and security schemes", () => {
    const spec = OpenApiGenerator.generateSpec() as any;

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Anantham V2 Runtime API");
    expect(spec.paths["/v1/projects"]).toBeDefined();
    expect(spec.paths["/v1/sessions"]).toBeDefined();
    expect(spec.paths["/v1/tasks"]).toBeDefined();
    expect(spec.paths["/v1/tasks/{taskId}/claim"]).toBeDefined();
    expect(spec.paths["/v1/jobs"]).toBeDefined();
    expect(spec.paths["/v1/nodes"]).toBeDefined();
    expect(spec.paths["/v1/artifacts"]).toBeDefined();
    expect(spec.paths["/v1/events"]).toBeDefined();
    expect(spec.components.securitySchemes.BearerAuth).toBeDefined();
  });
});
