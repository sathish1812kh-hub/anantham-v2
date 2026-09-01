/**
 * OpenAPI 3.1.0 Specification Generator for Anantham V2.
 * PRD Part 2 Section 210.
 */
export class OpenApiGenerator {
  public static generateSpec(): Record<string, unknown> {
    return {
      openapi: "3.1.0",
      info: {
        title: "Anantham V2 Runtime API",
        version: "2.0.0-alpha.1",
        description: "Programmatic REST API for Anantham V2 AI Agent Operating Environment.",
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Local Runtime Server",
        },
      ],
      paths: {
        "/v1/health": {
          get: {
            summary: "Health check",
            responses: {
              "200": { description: "Runtime healthy" },
            },
          },
        },
        "/v1/doctor": {
          get: {
            summary: "System Diagnostics",
            responses: {
              "200": { description: "Diagnostics report" },
            },
          },
        },
        "/v1/projects": {
          get: {
            summary: "List projects",
            responses: {
              "200": { description: "Array of projects" },
            },
          },
          post: {
            summary: "Create project",
            requestBody: {
              required: true,
              content: { "application/json": { schema: { type: "object" } } },
            },
            responses: {
              "201": { description: "Project created" },
            },
          },
        },
        "/v1/sessions": {
          get: {
            summary: "List sessions in project",
            parameters: [{ name: "projectId", in: "query", required: true, schema: { type: "string" } }],
            responses: {
              "200": { description: "Array of sessions" },
            },
          },
          post: {
            summary: "Create session",
            requestBody: {
              required: true,
              content: { "application/json": { schema: { type: "object" } } },
            },
            responses: {
              "201": { description: "Session created" },
            },
          },
        },
        "/v1/tasks": {
          get: {
            summary: "List tasks in session",
            parameters: [{ name: "sessionId", in: "query", required: true, schema: { type: "string" } }],
            responses: {
              "200": { description: "Array of tasks" },
            },
          },
          post: {
            summary: "Create task",
            requestBody: {
              required: true,
              content: { "application/json": { schema: { type: "object" } } },
            },
            responses: {
              "201": { description: "Task created" },
            },
          },
        },
        "/v1/tasks/{taskId}/claim": {
          post: {
            summary: "Claim task with lease",
            parameters: [{ name: "taskId", in: "path", required: true, schema: { type: "string" } }],
            requestBody: {
              required: true,
              content: { "application/json": { schema: { type: "object" } } },
            },
            responses: {
              "200": { description: "Task claimed and lease acquired" },
            },
          },
        },
        "/v1/jobs": {
          get: {
            summary: "List background jobs",
            parameters: [{ name: "projectId", in: "query", required: true, schema: { type: "string" } }],
            responses: {
              "200": { description: "Array of background jobs" },
            },
          },
          post: {
            summary: "Create background job",
            requestBody: {
              required: true,
              content: { "application/json": { schema: { type: "object" } } },
            },
            responses: {
              "201": { description: "Background job created" },
            },
          },
        },
        "/v1/nodes": {
          get: {
            summary: "List registered remote worker nodes",
            responses: {
              "200": { description: "Array of remote nodes" },
            },
          },
        },
        "/v1/artifacts": {
          get: {
            summary: "List artifacts in session",
            parameters: [{ name: "sessionId", in: "query", required: true, schema: { type: "string" } }],
            responses: {
              "200": { description: "Array of artifacts" },
            },
          },
        },
        "/v1/events": {
          get: {
            summary: "Query event stream",
            parameters: [
              { name: "sessionId", in: "query", schema: { type: "string" } },
              { name: "limit", in: "query", schema: { type: "integer" } },
              { name: "offset", in: "query", schema: { type: "integer" } },
            ],
            responses: {
              "200": { description: "Paginated events" },
            },
          },
        },
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            type: "http",
            scheme: "bearer",
          },
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
          },
        },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    };
  }
}
