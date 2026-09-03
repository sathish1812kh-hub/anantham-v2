/**
 * OpenAPI 3.1 Specification Generator & Route Schema Validator
 * PRD-PART2-307: OpenAPI / Swagger API Documentation & Schema Validation
 */

export interface OpenApiRouteDefinition {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  summary: string;
  description?: string;
  tags?: string[];
  requestBodySchema?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
}

export class OpenApiSpecGenerator {
  private routes: OpenApiRouteDefinition[] = [];
  private title: string;
  private version: string;

  constructor(title = "Anantham V2 Agent Operating Environment API", version = "2.0.0") {
    this.title = title;
    this.version = version;
    this.registerDefaultRoutes();
  }

  public registerRoute(route: OpenApiRouteDefinition): void {
    this.routes.push(route);
  }

  public generateSpecJson(): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};

    for (const r of this.routes) {
      if (!paths[r.path]) {
        paths[r.path] = {};
      }
      paths[r.path]![r.method.toLowerCase()] = {
        summary: r.summary,
        description: r.description,
        tags: r.tags ?? ["General"],
        requestBody: r.requestBodySchema
          ? {
              required: true,
              content: { "application/json": { schema: r.requestBodySchema } },
            }
          : undefined,
        responses: {
          "200": {
            description: "Successful response",
            content: r.responseSchema ? { "application/json": { schema: r.responseSchema } } : undefined,
          },
        },
      };
    }

    return {
      openapi: "3.1.0",
      info: {
        title: this.title,
        version: this.version,
        description: "Authoritative Anantham V2 REST & WebSocket API Gateway Specification",
      },
      paths,
    };
  }

  private registerDefaultRoutes(): void {
    this.registerRoute({
      path: "/api/v2/sessions",
      method: "POST",
      summary: "Create a new agent session",
      tags: ["Sessions"],
      requestBodySchema: {
        type: "object",
        properties: { projectId: { type: "string" }, modelId: { type: "string" } },
        required: ["projectId"],
      },
    });

    this.registerRoute({
      path: "/api/v2/sessions/{id}/messages",
      method: "POST",
      summary: "Send prompt message to session",
      tags: ["Sessions"],
    });

    this.registerRoute({
      path: "/api/v2/tools/execute",
      method: "POST",
      summary: "Execute tool through ToolGateway",
      tags: ["Tools"],
    });
  }
}
