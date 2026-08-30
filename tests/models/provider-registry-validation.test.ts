import { describe, it, expect } from "vitest";
import {
  ProviderRegistry,
  ProviderDefinitionSchema,
  validateEndpointUrl,
} from "../../src/models/provider-registry.js";

describe("ProviderRegistry - Configuration & SSRF Boundary", () => {
  it("validates ProviderDefinitionSchema for valid HTTP/HTTPS providers", () => {
    const def = ProviderDefinitionSchema.parse({
      providerId: "openai-custom",
      name: "Custom OpenAI Gateway",
      protocol: "openai-compatible",
      baseUrl: "https://gateway.internal.corp/v1",
      supportedModels: ["model-a", "model-b"],
      authProfileId: "prof_01",
    });

    expect(def.providerId).toBe("openai-custom");
    expect(def.protocol).toBe("openai-compatible");
    expect(def.timeoutMs).toBe(30000);
  });

  it("registers and retrieves provider definitions safely", () => {
    const registry = new ProviderRegistry();
    registry.registerProvider({
      providerId: "openrouter",
      name: "OpenRouter Aggregator",
      protocol: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      supportedModels: ["anthropic/claude-3.5-sonnet", "openai/gpt-4o"],
    });

    expect(registry.getProvider("openrouter")).toBeDefined();
    expect(registry.listProviders().length).toBe(1);
    expect(registry.removeProvider("openrouter")).toBe(true);
    expect(registry.getProvider("openrouter")).toBeUndefined();
  });

  it("SSRF BOUNDARY: Rejects invalid or dangerous URL schemes (file:, gopher:, javascript:, ftp:)", () => {
    expect(() => validateEndpointUrl("file:///etc/passwd")).toThrow();
    expect(() => validateEndpointUrl("gopher://127.0.0.1:70/")).toThrow();
    expect(() => validateEndpointUrl("javascript:alert(1)")).toThrow();
    expect(() => validateEndpointUrl("ftp://files.corp.net")).toThrow();

    expect(validateEndpointUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
    expect(validateEndpointUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
  });
});
