import { z } from "zod";

/**
 * Provider endpoint and protocol configuration schema.
 * PRD Part 2 Section 42 & PRD Part 3 Section 142.
 */
export const ProviderProtocolSchema = z.enum([
  "openrouter",
  "openai",
  "anthropic",
  "gemini",
  "openai-compatible",
  "anthropic-compatible",
  "custom",
]);
export type ProviderProtocol = z.infer<typeof ProviderProtocolSchema>;

export const ProviderDefinitionSchema = z.object({
  providerId: z.string().min(1),
  name: z.string().min(1),
  protocol: ProviderProtocolSchema,
  baseUrl: z.string().url(),
  supportedModels: z.array(z.string()).default([]),
  authProfileId: z.string().optional(),
  timeoutMs: z.number().int().positive().default(30000),
});
export type ProviderDefinition = z.infer<typeof ProviderDefinitionSchema>;

/**
 * Validates endpoint URL for SSRF protection (must be http or https).
 */
export function validateEndpointUrl(urlStr: string): string {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch (err: any) {
    throw new Error(`Invalid provider endpoint URL: ${urlStr}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported provider URL scheme '${parsed.protocol}'. Only http: and https: are allowed.`);
  }

  return urlStr;
}

/**
 * Central registry of available AI providers, endpoints, and protocol adapters.
 */
export class ProviderRegistry {
  private providers: Map<string, ProviderDefinition> = new Map();

  public registerProvider(definition: ProviderDefinition): void {
    const validated = ProviderDefinitionSchema.parse(definition);
    validateEndpointUrl(validated.baseUrl);
    this.providers.set(validated.providerId, validated);
  }

  public getProvider(providerId: string): ProviderDefinition | undefined {
    return this.providers.get(providerId);
  }

  public listProviders(): ProviderDefinition[] {
    return Array.from(this.providers.values());
  }

  public removeProvider(providerId: string): boolean {
    return this.providers.delete(providerId);
  }
}
