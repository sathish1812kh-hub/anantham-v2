import {
  type ModelRequest,
  type ModelResponse,
  type ModelStreamChunk,
  type ToolCall,
  ModelRequestSchema,
  ModelResponseSchema,
  ModelStreamChunkSchema,
} from "../../domain/model.js";
import type { ProviderAdapter, ProviderCapabilities } from "../provider-adapter.js";
import { type SecretStore } from "../secret-store.js";
import {
  AuthenticationError,
  ContentFilterError,
  ModelExecutionError,
  ModelTimeoutError,
  ProviderUnavailableError,
  RateLimitError,
} from "../model-errors.js";

export interface GeminiAdapterOptions {
  providerId?: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  secretStore?: SecretStore;
  credentialId?: string;
  fetchFn?: typeof fetch;
}

export class GeminiProviderAdapter implements ProviderAdapter {
  public readonly providerId: string;
  public readonly name: string;
  public readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly secretStore?: SecretStore;
  private readonly credentialId?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: GeminiAdapterOptions = {}) {
    this.providerId = options.providerId || "gemini";
    this.name = options.name || "Google Gemini REST/SSE API";
    this.baseUrl = (options.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.secretStore = options.secretStore;
    this.credentialId = options.credentialId;
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  private async getAuthToken(): Promise<string | undefined> {
    if (this.apiKey) return this.apiKey;
    if (this.secretStore && this.credentialId) {
      return this.secretStore.getSecret(this.credentialId);
    }
    return undefined;
  }

  private normalizeError(status: number, errorData: any, message?: string): Error {
    const errorMsg =
      errorData?.error?.message ||
      errorData?.message ||
      message ||
      `HTTP ${status} error from ${this.providerId}`;

    if (status === 401 || status === 403) {
      return new AuthenticationError(errorMsg, { providerId: this.providerId });
    }
    if (status === 429) {
      return new RateLimitError(errorMsg, { providerId: this.providerId });
    }
    if (status === 408) {
      return new ModelTimeoutError(errorMsg, { providerId: this.providerId });
    }
    if (status >= 500) {
      return new ProviderUnavailableError(errorMsg, { providerId: this.providerId });
    }
    if (status === 400) {
      if (errorMsg.includes("SAFETY")) {
        return new ContentFilterError(errorMsg, { providerId: this.providerId });
      }
      return new ModelExecutionError(errorMsg, { providerId: this.providerId, statusCode: 400 });
    }
    return new ModelExecutionError(errorMsg, { providerId: this.providerId, statusCode: status });
  }

  public getCapabilities(_modelId: string): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
      supportsAudio: true,
      maxContextTokens: 1000000,
      maxOutputTokens: 8192,
    };
  }

  public async send(request: ModelRequest): Promise<ModelResponse> {
    const validated = ModelRequestSchema.parse(request);
    const token = await this.getAuthToken();

    const systemMessages = validated.messages.filter((m) => m.role === "system");
    const nonSystemMessages = validated.messages.filter((m) => m.role !== "system");

    const contents = nonSystemMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const payload: any = {
      contents,
    };

    if (systemMessages.length > 0) {
      payload.systemInstruction = {
        parts: [{ text: systemMessages.map((m) => m.content).join("\n\n") }],
      };
    }

    if (validated.tools && validated.tools.length > 0) {
      payload.tools = [
        {
          functionDeclarations: validated.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    if (validated.temperature !== undefined || validated.maxTokens !== undefined) {
      payload.generationConfig = {};
      if (validated.temperature !== undefined) payload.generationConfig.temperature = validated.temperature;
      if (validated.maxTokens !== undefined) payload.generationConfig.maxOutputTokens = validated.maxTokens;
    }

    const url = `${this.baseUrl}/models/${validated.modelId}:generateContent${token ? `?key=${token}` : ""}`;

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      throw new ProviderUnavailableError(`Network connection to ${this.providerId} failed: ${err.message}`, {
        providerId: this.providerId,
      });
    }

    if (!res.ok) {
      let errJson: any;
      try {
        errJson = await res.json();
      } catch {
        // non-json response
      }
      throw this.normalizeError(res.status, errJson, res.statusText);
    }

    const json = (await res.json()) as any;
    const candidate = json.candidates?.[0];
    let textContent = "";
    const toolCalls: ToolCall[] = [];

    if (Array.isArray(candidate?.content?.parts)) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          textContent += part.text;
        } else if (part.functionCall) {
          toolCalls.push({
            id: `call_${Math.random().toString(36).slice(2, 8)}`,
            name: part.functionCall.name,
            argumentsJson: typeof part.functionCall.args === "object" && part.functionCall.args !== null ? JSON.stringify(part.functionCall.args) : "{}",
          });
        }
      }
    }

    let finishReason: any = "stop";
    if (candidate?.finishReason === "SAFETY") finishReason = "content_filter";
    else if (candidate?.finishReason === "MAX_TOKENS") finishReason = "length";
    else if (toolCalls.length > 0) finishReason = "tool_calls";

    const usageMeta = json.usageMetadata;
    const usage = {
      promptTokens: usageMeta?.promptTokenCount || 0,
      completionTokens: usageMeta?.candidatesTokenCount || 0,
      totalTokens: usageMeta?.totalTokenCount || 0,
    };

    return ModelResponseSchema.parse({
      id: `gemini_${Date.now()}`,
      modelId: validated.modelId,
      message: {
        role: "assistant",
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      finishReason,
      usage,
      createdAt: new Date().toISOString(),
    });
  }

  public async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const validated = ModelRequestSchema.parse(request);
    const token = await this.getAuthToken();

    const systemMessages = validated.messages.filter((m) => m.role === "system");
    const nonSystemMessages = validated.messages.filter((m) => m.role !== "system");

    const contents = nonSystemMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const payload: any = { contents };
    if (systemMessages.length > 0) {
      payload.systemInstruction = {
        parts: [{ text: systemMessages.map((m) => m.content).join("\n\n") }],
      };
    }

    const url = `${this.baseUrl}/models/${validated.modelId}:streamGenerateContent?alt=sse${token ? `&key=${token}` : ""}`;

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      throw new ProviderUnavailableError(`Network stream connection to ${this.providerId} failed: ${err.message}`, {
        providerId: this.providerId,
      });
    }

    if (!res.ok) {
      let errJson: any;
      try {
        errJson = await res.json();
      } catch {
        // non-json response
      }
      throw this.normalizeError(res.status, errJson, res.statusText);
    }

    if (!res.body) {
      throw new ProviderUnavailableError(`Response body is empty from ${this.providerId}`, {
        providerId: this.providerId,
      });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) {
            continue;
          }

          const dataStr = trimmed.slice(5).trim();
          try {
            const parsed = JSON.parse(dataStr);
            const candidate = parsed.candidates?.[0];
            const part = candidate?.content?.parts?.[0];

            if (part?.text) {
              yield ModelStreamChunkSchema.parse({
                id: `chunk_${Date.now()}`,
                modelId: validated.modelId,
                deltaText: part.text,
              });
            }
          } catch {
            // ignore malformed SSE
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
