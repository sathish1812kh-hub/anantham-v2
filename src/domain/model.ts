import { z } from "zod";

export const ModelRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type ModelRole = z.infer<typeof ModelRoleSchema>;

export const ToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  argumentsJson: z.string(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parameters: z.record(z.unknown()),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const ModelMessageSchema = z.object({
  role: ModelRoleSchema,
  content: z.string().default(""),
  name: z.string().optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolCallId: z.string().optional(),
});
export type ModelMessage = z.infer<typeof ModelMessageSchema>;

export const ModelRequestSchema = z.object({
  modelId: z.string().min(1),
  messages: z.array(ModelMessageSchema).min(1),
  tools: z.array(ToolDefinitionSchema).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ModelRequest = z.infer<typeof ModelRequestSchema>;

export const ModelUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().optional(),
});
export type ModelUsage = z.infer<typeof ModelUsageSchema>;

export const ModelFinishReasonSchema = z.enum([
  "stop",
  "tool_calls",
  "length",
  "content_filter",
  "error",
]);
export type ModelFinishReason = z.infer<typeof ModelFinishReasonSchema>;

export const ModelResponseSchema = z.object({
  id: z.string().min(1),
  modelId: z.string().min(1),
  message: ModelMessageSchema,
  finishReason: ModelFinishReasonSchema,
  usage: ModelUsageSchema,
  createdAt: z.string().min(1),
});
export type ModelResponse = z.infer<typeof ModelResponseSchema>;

export const ModelStreamChunkSchema = z.object({
  id: z.string().min(1),
  modelId: z.string().min(1),
  deltaText: z.string().optional(),
  deltaToolCalls: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        id: z.string().optional(),
        name: z.string().optional(),
        argumentsDelta: z.string().optional(),
      })
    )
    .optional(),
  finishReason: ModelFinishReasonSchema.optional(),
  usage: ModelUsageSchema.optional(),
});
export type ModelStreamChunk = z.infer<typeof ModelStreamChunkSchema>;
