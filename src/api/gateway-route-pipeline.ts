/**
 * Gateway Route Registry & Middleware Pipeline
 * PRD-API-001: Authoritative Gateway Route Registry & Middleware Pipeline
 */

export interface GatewayRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  tenantId?: string;
  userId?: string;
}

export interface GatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

export type GatewayMiddleware = (
  req: GatewayRequest,
  res: Partial<GatewayResponse>,
  next: () => Promise<void>
) => Promise<void>;

export type RouteHandler = (req: GatewayRequest) => Promise<GatewayResponse> | GatewayResponse;

export class GatewayRoutePipeline {
  private middlewares: GatewayMiddleware[] = [];
  private routes: Map<string, RouteHandler> = new Map(); // "METHOD:PATH" -> handler

  public use(middleware: GatewayMiddleware): void {
    this.middlewares.push(middleware);
  }

  public register(method: string, path: string, handler: RouteHandler): void {
    const key = `${method.toUpperCase()}:${path}`;
    this.routes.set(key, handler);
  }

  public async dispatch(req: GatewayRequest): Promise<GatewayResponse> {
    const key = `${req.method.toUpperCase()}:${req.path}`;
    const handler = this.routes.get(key);

    if (!handler) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: { error: `Not Found: ${req.method} ${req.path}` },
      };
    }

    const finalRes: GatewayResponse = {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: {},
    };

    // Execute canonical onion-model middleware chain
    let index = 0;
    const next = async (): Promise<void> => {
      if (index < this.middlewares.length) {
        const mw = this.middlewares[index++]!;
        await mw(req, finalRes, next);
      } else {
        const handlerRes = await handler(req);
        finalRes.statusCode = handlerRes.statusCode;
        finalRes.headers = { ...finalRes.headers, ...handlerRes.headers };
        finalRes.body = handlerRes.body;
      }
    };

    try {
      await next();
      return finalRes;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: { error: "Internal Server Error", message: errorMsg },
      };
    }
  }
}
