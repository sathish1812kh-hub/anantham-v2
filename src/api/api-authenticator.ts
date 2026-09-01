import { type IncomingMessage } from "node:http";
import { type ApiAuthContext, ApiAuthContextSchema } from "../domain/api.js";

export interface ApiAuthenticatorOptions {
  apiKeys?: Map<string, { actorId: string; role: string; allowedProjects: string[] }>;
  allowAnonymous?: boolean;
}

/**
 * API Authenticator validating Bearer tokens and API keys.
 * PRD Part 1 Section 32 & PRD Part 2 Section 200.
 */
export class ApiAuthenticator {
  private readonly apiKeys: Map<string, { actorId: string; role: string; allowedProjects: string[] }>;
  private readonly allowAnonymous: boolean;

  constructor(options: ApiAuthenticatorOptions = {}) {
    this.apiKeys = options.apiKeys ?? new Map();
    this.allowAnonymous = options.allowAnonymous ?? false;

    // Default development operator key if none configured
    if (this.apiKeys.size === 0) {
      this.apiKeys.set("anantham-dev-key", {
        actorId: "dev_operator",
        role: "admin",
        allowedProjects: ["*"],
      });
    }
  }

  /**
   * Authenticate incoming HTTP request.
   */
  public authenticate(req: IncomingMessage): ApiAuthContext {
    const authHeader = req.headers["authorization"];
    const apiKeyHeader = req.headers["x-api-key"];

    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (typeof apiKeyHeader === "string") {
      token = apiKeyHeader.trim();
    }

    if (token) {
      const keyInfo = this.apiKeys.get(token);
      if (keyInfo) {
        return ApiAuthContextSchema.parse({
          authenticated: true,
          actorId: keyInfo.actorId,
          role: keyInfo.role,
          allowedProjects: keyInfo.allowedProjects,
        });
      }
    }

    if (this.allowAnonymous) {
      return ApiAuthContextSchema.parse({
        authenticated: true,
        actorId: "anonymous_user",
        role: "viewer",
        allowedProjects: ["*"],
      });
    }

    return ApiAuthContextSchema.parse({
      authenticated: false,
      actorId: "unauthenticated",
      role: "none",
      allowedProjects: [],
    });
  }
}
