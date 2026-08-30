import type { ModelRequest, ModelResponse, ModelStreamChunk } from "../domain/model.js";

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsAudio: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
}

export interface ProviderAdapter {
  readonly providerId: string;
  readonly name: string;

  getCapabilities(modelId: string): ProviderCapabilities;
  send(request: ModelRequest): Promise<ModelResponse>;
  stream(request: ModelRequest): AsyncIterable<ModelStreamChunk>;
}
