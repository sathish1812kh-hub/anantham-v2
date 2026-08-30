import { describe, it, expect } from "vitest";
import { GeminiProviderAdapter } from "../../src/models/adapters/gemini-adapter.js";
import { RateLimitError, ContentFilterError } from "../../src/models/model-errors.js";

describe("GeminiProviderAdapter - Multimodal Parts, Tools & Safety Filters", () => {
  it("translates messages to Gemini contents and systemInstruction", async () => {
    let capturedUrl = "";
    let capturedBody: any;

    const mockFetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(options.body);

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Response from Gemini 1.5 Pro" }],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: {
            promptTokenCount: 18,
            candidatesTokenCount: 6,
            totalTokenCount: 24,
          },
        }),
        { status: 200 }
      );
    };

    const adapter = new GeminiProviderAdapter({
      apiKey: "AIzaSyTestKey123",
      fetchFn: mockFetch as any,
    });

    const res = await adapter.send({
      modelId: "gemini-1.5-pro",
      messages: [
        { role: "system", content: "You are Gemini." },
        { role: "user", content: "Hello Gemini" },
      ],
    });

    expect(capturedUrl).toContain("models/gemini-1.5-pro:generateContent?key=AIzaSyTestKey123");
    expect(capturedBody.systemInstruction.parts[0].text).toBe("You are Gemini.");
    expect(capturedBody.contents[0].role).toBe("user");
    expect(res.message.content).toBe("Response from Gemini 1.5 Pro");
    expect(res.usage?.totalTokens).toBe(24);
  });

  it("normalizes Gemini functionCall into ToolCall structure", async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "calculate_sum",
                      args: { a: 10, b: 20 },
                    },
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
        }),
        { status: 200 }
      );
    };

    const adapter = new GeminiProviderAdapter({
      apiKey: "AIzaSyTestKey",
      fetchFn: mockFetch as any,
    });

    const res = await adapter.send({
      modelId: "gemini-1.5-pro",
      messages: [{ role: "user", content: "Calculate 10 + 20" }],
    });

    expect(res.finishReason).toBe("tool_calls");
    expect(res.message.toolCalls?.length).toBe(1);
    expect(res.message.toolCalls?.[0].name).toBe("calculate_sum");
    expect(res.message.toolCalls?.[0].argumentsJson).toBe("{\"a\":10,\"b\":20}");
  });

  it("maps Gemini safety filter rejection to ContentFilterError", async () => {
    const fetchSafety = async () => new Response(JSON.stringify({ error: { message: "Prompt blocked by SAFETY policy" } }), { status: 400 });
    const adapter = new GeminiProviderAdapter({ fetchFn: fetchSafety as any });

    await expect(
      adapter.send({ modelId: "gemini-1.5-flash", messages: [{ role: "user", content: "unsafe text" }] })
    ).rejects.toThrow(ContentFilterError);
  });
});
