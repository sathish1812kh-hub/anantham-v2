import { randomUUID } from "node:crypto";
import {
  ModelRequestSchema,
  ModelResponseSchema,
  type ModelRequest,
  type ModelResponse,
  type ModelStreamChunk,
} from "../domain/model.js";
import {
  AuthenticationError,
  ContextWindowExceededError,
  ModelTimeoutError,
  ProviderUnavailableError,
  RateLimitError,
} from "./model-errors.js";
import type { ProviderAdapter, ProviderCapabilities } from "./provider-adapter.js";

export interface MockProviderOptions {
  providerId?: string;
  name?: string;
  defaultResponseText?: string;
  simulatedDelayMs?: number;
  injectedError?: "rate_limit" | "auth" | "timeout" | "unavailable" | "context_overflow";
  retryAfterMs?: number;
}

export class MockProviderAdapter implements ProviderAdapter {
  public readonly providerId: string;
  public readonly name: string;
  private options: MockProviderOptions;

  constructor(options?: MockProviderOptions) {
    this.providerId = options?.providerId || "mock-provider";
    this.name = options?.name || "Mock Provider Adapter";
    this.options = options || {};
  }

  public setOptions(options: Partial<MockProviderOptions>): void {
    this.options = { ...this.options, ...options };
  }

  public getCapabilities(_modelId: string): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
      supportsAudio: false,
      maxContextTokens: 128000,
      maxOutputTokens: 8192,
    };
  }

  private checkInjectedError(): void {
    if (this.options.injectedError === "rate_limit") {
      throw new RateLimitError("Mock provider rate limit exceeded (429)", {
        providerId: this.providerId,
        retryAfterMs: this.options.retryAfterMs || 5000,
      });
    }
    if (this.options.injectedError === "auth") {
      throw new AuthenticationError("Mock provider invalid credentials (401)", {
        providerId: this.providerId,
      });
    }
    if (this.options.injectedError === "timeout") {
      throw new ModelTimeoutError("Mock provider execution timed out (408)", {
        providerId: this.providerId,
        timeoutMs: 30000,
      });
    }
    if (this.options.injectedError === "unavailable") {
      throw new ProviderUnavailableError("Mock provider service unavailable (503)", {
        providerId: this.providerId,
      });
    }
    if (this.options.injectedError === "context_overflow") {
      throw new ContextWindowExceededError("Mock context window exceeded limit", {
        providerId: this.providerId,
        tokenCount: 150000,
        maxContextTokens: 128000,
      });
    }
  }

  public async send(request: ModelRequest): Promise<ModelResponse> {
    const validatedReq = ModelRequestSchema.parse(request);
    this.checkInjectedError();

    if (this.options.simulatedDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.options.simulatedDelayMs));
    }

    const lastMessage = validatedReq.messages[validatedReq.messages.length - 1] ?? { role: "user" as const, content: "" };
    const responseId = `resp_${randomUUID().slice(0, 12)}`;

    // Check if tools were provided and last message requested a tool
    if (validatedReq.tools && validatedReq.tools.length > 0 && /tool|call|run/i.test(lastMessage.content)) {
      const toolToCall = validatedReq.tools[0];
      if (toolToCall) {
        const response: ModelResponse = {
          id: responseId,
          modelId: validatedReq.modelId,
          message: {
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: `call_${randomUUID().slice(0, 8)}`,
                name: toolToCall.name,
                argumentsJson: JSON.stringify({ query: "mock query argument" }),
              },
            ],
          },
          finishReason: "tool_calls",
          usage: {
            promptTokens: 50,
            completionTokens: 25,
            totalTokens: 75,
            costUsd: 0.0001,
          },
          createdAt: new Date().toISOString(),
        };
        return Object.freeze(ModelResponseSchema.parse(response));
      }
    }

    const responseText = this.options.defaultResponseText || `Mock response for: ${lastMessage.content.slice(0, 50)}`;
    const response: ModelResponse = {
      id: responseId,
      modelId: validatedReq.modelId,
      message: {
        role: "assistant",
        content: responseText,
      },
      finishReason: "stop",
      usage: {
        promptTokens: 40,
        completionTokens: 20,
        totalTokens: 60,
        costUsd: 0.00008,
      },
      createdAt: new Date().toISOString(),
    };

    return Object.freeze(ModelResponseSchema.parse(response));
  }

  public async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const validatedReq = ModelRequestSchema.parse(request);
    this.checkInjectedError();

    const lastMessage = validatedReq.messages[validatedReq.messages.length - 1] ?? { role: "user" as const, content: "" };
    const streamId = `stream_${randomUUID().slice(0, 12)}`;
    const responseText = this.options.defaultResponseText || `Streaming: ${lastMessage.content.slice(0, 50)}`;
    const words = responseText.split(" ");

    for (let i = 0; i < words.length; i++) {
      if (this.options.simulatedDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, this.options.simulatedDelayMs));
      }
      yield {
        id: streamId,
        modelId: validatedReq.modelId,
        deltaText: (i === 0 ? "" : " ") + words[i],
      };
    }

    // Final chunk
    yield {
      id: streamId,
      modelId: validatedReq.modelId,
      finishReason: "stop",
      usage: {
        promptTokens: 40,
        completionTokens: words.length * 2,
        totalTokens: 40 + words.length * 2,
      },
    };
  }
}
