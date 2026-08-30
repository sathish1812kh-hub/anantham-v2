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

export interface AnthropicAdapterOptions {
  providerId?: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  secretStore?: SecretStore;
  credentialId?: string;
  anthropicVersion?: string;
  fetchFn?: typeof fetch;
}

export class AnthropicCompatibleAdapter implements ProviderAdapter {
  public readonly providerId: string;
  public readonly name: string;
  public readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly secretStore?: SecretStore;
  private readonly credentialId?: string;
  private readonly anthropicVersion: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: AnthropicAdapterOptions = {}) {
    this.providerId = options.providerId || "anthropic";
    this.name = options.name || "Anthropic Messages API";
    this.baseUrl = (options.baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.secretStore = options.secretStore;
    this.credentialId = options.credentialId;
    this.anthropicVersion = options.anthropicVersion || "2023-06-01";
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
    if (status >= 500 || status === 529) {
      return new ProviderUnavailableError(errorMsg, { providerId: this.providerId });
    }
    if (status === 400) {
      if (errorMsg.toLowerCase().includes("context") || errorMsg.toLowerCase().includes("prompt is too long")) {
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
      maxContextTokens: 200000,
      maxOutputTokens: 8192,
    };
  }

  public async send(request: ModelRequest): Promise<ModelResponse> {
    const validated = ModelRequestSchema.parse(request);
    const token = await this.getAuthToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": this.anthropicVersion,
    };
    if (token) {
      headers["x-api-key"] = token;
    }

    const systemMessages = validated.messages.filter((m) => m.role === "system");
    const nonSystemMessages = validated.messages.filter((m) => m.role !== "system");

    const payload: any = {
      model: validated.modelId,
      messages: nonSystemMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: validated.maxTokens || 4096,
      stream: false,
    };

    if (systemMessages.length > 0) {
      payload.system = systemMessages.map((m) => m.content).join("\n\n");
    }

    if (validated.temperature !== undefined) {
      payload.temperature = validated.temperature;
    }

    if (validated.tools && validated.tools.length > 0) {
      payload.tools = validated.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/messages`, {
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
    let textContent = "";
    const toolCalls: ToolCall[] = [];

    if (Array.isArray(json.content)) {
      for (const block of json.content) {
        if (block.type === "text") {
          textContent += block.text || "";
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id || `tu_${Math.random().toString(36).slice(2, 8)}`,
            name: block.name || "unnamed_tool",
            argumentsJson: typeof block.input === "object" && block.input !== null ? JSON.stringify(block.input) : "{}",
          });
        }
      }
    }

    let finishReason: any = "stop";
    if (json.stop_reason === "tool_use") finishReason = "tool_calls";
    else if (json.stop_reason === "max_tokens") finishReason = "length";

    const usage = {
      promptTokens: json.usage?.input_tokens || 0,
      completionTokens: json.usage?.output_tokens || 0,
      totalTokens: (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0),
    };

    return ModelResponseSchema.parse({
      id: json.id || `msg_${Date.now()}`,
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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": this.anthropicVersion,
    };
    if (token) {
      headers["x-api-key"] = token;
    }

    const systemMessages = validated.messages.filter((m) => m.role === "system");
    const nonSystemMessages = validated.messages.filter((m) => m.role !== "system");

    const payload: any = {
      model: validated.modelId,
      messages: nonSystemMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: validated.maxTokens || 4096,
      stream: true,
    };

    if (systemMessages.length > 0) {
      payload.system = systemMessages.map((m) => m.content).join("\n\n");
    }

    if (validated.tools && validated.tools.length > 0) {
      payload.tools = validated.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/messages`, {
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
          try {
            const parsed = JSON.parse(dataStr);

            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
              yield ModelStreamChunkSchema.parse({
                id: `chunk_${Date.now()}`,
                modelId: validated.modelId,
                deltaText: parsed.delta.text || "",
              });
            } else if (parsed.type === "message_delta") {
              let finishReason: any = undefined;
              if (parsed.delta?.stop_reason === "end_turn") finishReason = "stop";
              else if (parsed.delta?.stop_reason === "tool_use") finishReason = "tool_calls";
              else if (parsed.delta?.stop_reason === "max_tokens") finishReason = "length";

              yield ModelStreamChunkSchema.parse({
                id: `chunk_${Date.now()}`,
                modelId: validated.modelId,
                finishReason,
                usage: parsed.usage
                  ? {
                      promptTokens: 0,
                      completionTokens: parsed.usage.output_tokens || 0,
                      totalTokens: parsed.usage.output_tokens || 0,
                    }
                  : undefined,
              });
            }
          } catch {
            // ignore malformed SSE line
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
