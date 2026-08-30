import { type ToolRegistration } from "../tool-registry.js";

export interface NetworkToolsOptions {
  allowLocalhost?: boolean;
  defaultTimeoutMs?: number;
  maxResponseBytes?: number;
}

export function createNetworkTools(options: NetworkToolsOptions = {}): ToolRegistration[] {
  const defaultTimeoutMs = options.defaultTimeoutMs || 15000;
  const maxResponseBytes = options.maxResponseBytes || 5 * 1024 * 1024; // 5MB

  const fetchUrlTool: ToolRegistration = {
    definition: {
      name: "fetch_url",
      description: "Perform an HTTP request to an external URL with SSRF boundary protection.",
      parametersSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string" },
          headers: { type: "object" },
          timeoutMs: { type: "number" },
        },
        required: ["url"],
      },
      isIdempotent: false,
      riskLevel: "high",
    },
    handler: async (args: any, context) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(args.url);
      } catch {
        throw new Error(`Invalid URL provided: "${args.url}".`);
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error(`Security violation: Unsupported protocol "${parsedUrl.protocol}". Only HTTP/HTTPS allowed.`);
      }

      // SSRF Boundary Check
      const hostname = parsedUrl.hostname.toLowerCase();
      if (!options.allowLocalhost) {
        if (
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname === "::1" ||
          hostname === "169.254.169.254" ||
          hostname.startsWith("192.168.") ||
          hostname.startsWith("10.") ||
          hostname.endsWith(".internal") ||
          hostname.endsWith(".local")
        ) {
          throw new Error(`Security violation: Request to internal/private network target "${hostname}" blocked by SSRF policy.`);
        }
      }

      const controller = new AbortController();
      const timeout = args.timeoutMs || defaultTimeoutMs;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      if (context.signal) {
        context.signal.addEventListener("abort", () => controller.abort());
      }

      try {
        const response = await fetch(parsedUrl.toString(), {
          method: args.method || "GET",
          headers: args.headers || {},
          signal: controller.signal,
        });

        const text = await response.text();
        clearTimeout(timeoutId);

        if (Buffer.byteLength(text) > maxResponseBytes) {
          throw new Error(`Response size exceeds limit of ${maxResponseBytes} bytes.`);
        }

        // Secret scrubbing in response
        const cleanBody = text.replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_SECRET]");

        return {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: cleanBody,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          throw new Error(`Request timed out after ${timeout}ms.`);
        }
        throw err;
      }
    },
  };

  return [fetchUrlTool];
}
