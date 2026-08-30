import { describe, it, expect } from "vitest";
import { OpenAICompatibleAdapter } from "../../src/models/adapters/openai-compatible-adapter.js";
import { ProviderRegistry } from "../../src/models/provider-registry.js";

describe("P3.5 Security Boundaries - SSRF, Prototype Pollution & Zero-Secret Leakage", () => {
  it("SSRF BOUNDARY: ProviderRegistry disallows file://, gopher://, and dangerous schemes", () => {
    const registry = new ProviderRegistry();
    expect(() => {
      registry.registerProvider({
        providerId: "evil-ssrf",
        name: "Evil Provider",
        protocol: "openai-compatible",
        baseUrl: "file:///etc/passwd",
        supportedModels: ["evil"],
      });
    }).toThrow();
  });

  it("ZERO SECRET LEAKAGE: Network error messages never contain the raw authorization secret", async () => {
    const rawSecret = "sk-super-secret-production-key-99999";
    const failingFetch = async () => {
      throw new Error("Connection refused to 10.0.0.1:8000");
    };

    const adapter = new OpenAICompatibleAdapter({
      apiKey: rawSecret,
      fetchFn: failingFetch as any,
    });

    try {
      await adapter.send({
        modelId: "gpt-4o",
        messages: [{ role: "user", content: "test" }],
      });
    } catch (err: any) {
      expect(err.message).not.toContain(rawSecret);
      expect(err.message).toContain("Connection refused");
    }
  });

  it("PROTOTYPE POLLUTION DEFENSE: Malformed JSON with __proto__ in tool arguments is parsed safely", async () => {
    const maliciousJson = "{\"__proto__\":{\"polluted\":true},\"safeArg\":\"123\"}";

    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "call_proto_1",
                    function: { name: "test_tool", arguments: maliciousJson },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
        { status: 200 }
      );
    };

    const adapter = new OpenAICompatibleAdapter({ fetchFn: mockFetch as any });
    const res = await adapter.send({
      modelId: "gpt-4o",
      messages: [{ role: "user", content: "test" }],
    });

    expect((({} as any).polluted)).toBeUndefined();
    expect(res.message.toolCalls?.[0].argumentsJson).toBe(maliciousJson);
  });
});
