import type { ModelCapabilityProfile } from "../domain/capability.js";

export const GPT_4O_PROFILE: Readonly<ModelCapabilityProfile> = Object.freeze({
  modelId: "gpt-4o",
  providerId: "openai",
  inputs: {
    textInput: true,
    imageInput: true,
    audioInput: true,
    videoInput: false,
    documentInput: true,
  },
  outputs: {
    textOutput: true,
    imageOutput: false,
    audioOutput: true,
    videoOutput: false,
  },
  features: {
    toolCalling: true,
    parallelToolCalls: true,
    structuredOutput: true,
    jsonSchema: true,
    streaming: true,
    reasoning: false,
    computerUse: false,
    webSearch: false,
    codeExecution: false,
    promptCaching: false,
  },
  limits: {
    contextWindow: 128000,
    maxOutputTokens: 16384,
  },
  status: "valid",
});

export const CLAUDE_3_5_SONNET_PROFILE: Readonly<ModelCapabilityProfile> = Object.freeze({
  modelId: "claude-3-5-sonnet",
  providerId: "anthropic",
  inputs: {
    textInput: true,
    imageInput: true,
    audioInput: false,
    videoInput: false,
    documentInput: true,
  },
  outputs: {
    textOutput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  features: {
    toolCalling: true,
    parallelToolCalls: true,
    structuredOutput: true,
    jsonSchema: true,
    streaming: true,
    reasoning: false,
    computerUse: true,
    webSearch: false,
    codeExecution: false,
    promptCaching: true,
  },
  limits: {
    contextWindow: 200000,
    maxOutputTokens: 8192,
  },
  status: "valid",
});

export const GEMINI_1_5_PRO_PROFILE: Readonly<ModelCapabilityProfile> = Object.freeze({
  modelId: "gemini-1.5-pro",
  providerId: "google",
  inputs: {
    textInput: true,
    imageInput: true,
    audioInput: true,
    videoInput: true,
    documentInput: true,
  },
  outputs: {
    textOutput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  features: {
    toolCalling: true,
    parallelToolCalls: true,
    structuredOutput: true,
    jsonSchema: true,
    streaming: true,
    reasoning: false,
    computerUse: false,
    webSearch: true,
    codeExecution: true,
    promptCaching: true,
  },
  limits: {
    contextWindow: 2000000,
    maxOutputTokens: 8192,
  },
  status: "valid",
});

export const TEXT_ONLY_LOCAL_PROFILE: Readonly<ModelCapabilityProfile> = Object.freeze({
  modelId: "local-llama-3-8b",
  providerId: "ollama",
  inputs: {
    textInput: true,
    imageInput: false,
    audioInput: false,
    videoInput: false,
    documentInput: false,
  },
  outputs: {
    textOutput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  features: {
    toolCalling: true,
    parallelToolCalls: false,
    structuredOutput: false,
    jsonSchema: false,
    streaming: true,
    reasoning: false,
    computerUse: false,
    webSearch: false,
    codeExecution: false,
    promptCaching: false,
  },
  limits: {
    contextWindow: 8192,
    maxOutputTokens: 2048,
  },
  status: "valid",
});
