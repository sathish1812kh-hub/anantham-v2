import { z } from "zod";

/**
 * CLI Output formatting mode.
 */
export const CliOutputModeSchema = z.enum(["text", "json", "jsonl"]);
export type CliOutputMode = z.infer<typeof CliOutputModeSchema>;

/**
 * Parsed Command representation.
 */
export const ParsedCommandSchema = z.object({
  raw: z.string(),
  name: z.string().min(1),
  args: z.array(z.string()).default([]),
  options: z.record(z.union([z.string(), z.boolean(), z.number()])).default({}),
  isSlashCommand: z.boolean().default(false),
});
export type ParsedCommand = z.infer<typeof ParsedCommandSchema>;

/**
 * Command Execution Result.
 */
export const CommandExecutionResultSchema = z.object({
  success: z.boolean(),
  commandName: z.string().min(1),
  message: z.string().optional(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  classification: z.string().optional(),
  exitRequested: z.boolean().default(false),
});
export type CommandExecutionResult = z.infer<typeof CommandExecutionResultSchema>;

/**
 * Interactive CLI Session Context.
 */
export const CliContextSchema = z.object({
  activeProjectId: z.string().optional(),
  activeSessionId: z.string().optional(),
  activeAgentId: z.string().optional(),
  outputMode: CliOutputModeSchema.default("text"),
  correlationId: z.string().min(1),
  user: z.string().default("operator"),
  metadata: z.record(z.unknown()).default({}),
});
export type CliContext = z.infer<typeof CliContextSchema>;

/**
 * Command Argument / Option descriptor for typed validation and help output.
 */
export const CommandOptionDescriptorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  alias: z.string().optional(),
  type: z.enum(["string", "boolean", "number"]).default("string"),
  required: z.boolean().default(false),
  defaultValue: z.union([z.string(), z.boolean(), z.number()]).optional(),
});
export type CommandOptionDescriptor = z.infer<typeof CommandOptionDescriptorSchema>;

export const CommandDescriptorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  usage: z.string().min(1),
  argsDescription: z.string().optional(),
  options: z.array(CommandOptionDescriptorSchema).default([]),
});
export type CommandDescriptor = z.infer<typeof CommandDescriptorSchema>;
