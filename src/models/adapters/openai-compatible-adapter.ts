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
  ContextWindowExceededError,
  ModelExecutionError,
  ModelTimeoutError,
  ProviderUnavailableError,
  RateLimitError,
} from "../model-errors.js";

export interface OpenAICompatibleAdapterOptions {
  providerId?: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  secretStore?: SecretStore;
  credentialId?: string;
  fetchFn?: typeof fetch;
  customHeaders?: Record<string, string>;
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  public readonly providerId: string;
  public readonly name: string;
  public readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly secretStore?: SecretStore;
  private readonly credentialId?: string;
  private readonly fetchFn: typeof fetch;
  private readonly customHeaders: Record<string, string>;

  constructor(options: OpenAICompatibleAdapterOptions = {}) {
    this.providerId = options.providerId || "openai";
    this.name = options.name || (this.providerId === "openai" ? "OpenAI Direct Provider" : `${this.providerId} OpenAI-Compatible`);
    this.baseUrl = (options.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.secretStore = options.secretStore;
    this.credentialId = options.credentialId;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.customHeaders = options.customHeaders || {};
  }

  private async getAuthToken(): Promise<string | undefined> {
    if (this.apiKey) return this.apiKey;
    if (this.secretStore && this.credentialId) {
      return this.secretStore.getSecret(this.credentialId);
    }
    const envVar = `${this.providerId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
    return process.env[envVar];
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
      if (errorMsg.toLowerCase().includes("context") || errorMsg.toLowerCase().includes("token")) {
        return new ContextWindowExceededError(errorMsg, { providerId: this.providerId });
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
      supportsAudio: false,
      maxContextTokens: 128000,
      maxOutputTokens: 4096,
    };
  }

  public async send(request: ModelRequest): Promise<ModelResponse> {
    const validated = ModelRequestSchema.parse(request);
    const token = await this.getAuthToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.customHeaders,
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const payload: any = {
      model: validated.modelId,
      messages: validated.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
    };

    if (validated.tools && validated.tools.length > 0) {
      payload.tools = validated.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    if (validated.temperature !== undefined) payload.temperature = validated.temperature;
    if (validated.maxTokens !== undefined) payload.max_tokens = validated.maxTokens;

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
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
    const choice = json.choices?.[0];
    const message = choice?.message || {};

    const toolCalls: ToolCall[] = [];
    if (Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        let argsJson = "{}";
        if (typeof tc.function?.arguments === "string") {
          argsJson = tc.function.arguments;
        } else if (typeof tc.function?.arguments === "object" && tc.function.arguments !== null) {
          argsJson = JSON.stringify(tc.function.arguments);
        }

        toolCalls.push({
          id: tc.id || `tc_${Math.random().toString(36).slice(2, 8)}`,
          name: tc.function?.name || "unnamed_tool",
          argumentsJson: argsJson,
        });
      }
    }

    let finishReason: any = "stop";
    if (choice?.finish_reason === "tool_calls") finishReason = "tool_calls";
    else if (choice?.finish_reason === "length") finishReason = "length";
    else if (choice?.finish_reason === "content_filter") finishReason = "content_filter";

    const usage = {
      promptTokens: json.usage?.prompt_tokens || 0,
      completionTokens: json.usage?.completion_tokens || 0,
      totalTokens: json.usage?.total_tokens || 0,
    };

    return ModelResponseSchema.parse({
      id: json.id || `resp_${Date.now()}`,
      modelId: validated.modelId,
      message: {
        role: "assistant",
        content: message.content || "",
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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.customHeaders,
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const payload: any = {
      model: validated.modelId,
      messages: validated.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    };

    if (validated.tools && validated.tools.length > 0) {
      payload.tools = validated.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
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
          if (dataStr === "[DONE]") {
            return;
          }

          try {
            const parsed = JSON.parse(dataStr);
            const choice = parsed.choices?.[0];
            const delta = choice?.delta;

            const deltaToolCalls = Array.isArray(delta?.tool_calls)
              ? delta.tool_calls.map((tc: any, idx: number) => ({
                  index: tc.index ?? idx,
                  id: tc.id,
                  name: tc.function?.name,
                  argumentsDelta: tc.function?.arguments,
                }))
              : undefined;

            let finishReason: any = undefined;
            if (choice?.finish_reason === "stop") finishReason = "stop";
            else if (choice?.finish_reason === "tool_calls") finishReason = "tool_calls";
            else if (choice?.finish_reason === "length") finishReason = "length";

            yield ModelStreamChunkSchema.parse({
              id: parsed.id || `chunk_${Date.now()}`,
              modelId: validated.modelId,
              deltaText: delta?.content || undefined,
              deltaToolCalls,
              finishReason,
              usage: parsed.usage
                ? {
                    promptTokens: parsed.usage.prompt_tokens || 0,
                    completionTokens: parsed.usage.completion_tokens || 0,
                    totalTokens: parsed.usage.total_tokens || 0,
                  }
                : undefined,
            });
          } catch {
            // Ignore malformed SSE chunk lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
