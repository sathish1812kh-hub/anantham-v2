/**
 * Multimodal Context Injector & Integrity Guard
 * PRD-MM-003: Multimodal Context Injection
 * PRD-INV-002: Strict Multimodal Integrity Invariants
 */

import type { MultimodalContextItem, MultimodalBudget } from "./types.js";

export type InjectionStyle = "inline" | "reference" | "multimodal_block";

export class MultimodalContextInjector {
  private budget: MultimodalBudget;

  constructor(budget?: Partial<MultimodalBudget>) {
    this.budget = {
      maxTokens: budget?.maxTokens ?? 32000,
      maxDimensionPixels: budget?.maxDimensionPixels ?? 4096,
      maxSizeBytes: budget?.maxSizeBytes ?? 10 * 1024 * 1024, // 10MB
      allowedFormats: budget?.allowedFormats ?? ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"],
    };
  }

  public validateItem(item: MultimodalContextItem): { valid: boolean; reason?: string } {
    // 1. Format check
    if (!this.budget.allowedFormats.includes(item.mimeType)) {
      return {
        valid: false,
        reason: `Unsupported multimodal format: '${item.mimeType}' (allowed: ${this.budget.allowedFormats.join(", ")})`,
      };
    }

    // 2. Token budget check
    if (item.estimatedTokens > this.budget.maxTokens) {
      return {
        valid: false,
        reason: `Item token estimate (${item.estimatedTokens}) exceeds max budget limit (${this.budget.maxTokens})`,
      };
    }

    // 3. Payload size check
    if (item.dataUri && item.dataUri.length > this.budget.maxSizeBytes) {
      return {
        valid: false,
        reason: `Payload size (${item.dataUri.length} chars) exceeds max size limit (${this.budget.maxSizeBytes})`,
      };
    }

    return { valid: true };
  }

  public injectItems(
    items: MultimodalContextItem[],
    style: InjectionStyle = "reference"
  ): { formattedContext: string; totalTokens: number; itemsIncluded: number } {
    let accumulatedTokens = 0;
    const formattedBlocks: string[] = [];
    let itemsIncluded = 0;

    for (const item of items) {
      const validation = this.validateItem(item);
      if (!validation.valid) {
        continue;
      }

      if (accumulatedTokens + item.estimatedTokens > this.budget.maxTokens) {
        break; // Stop at budget cap
      }

      accumulatedTokens += item.estimatedTokens;
      itemsIncluded++;

      switch (style) {
        case "inline":
          formattedBlocks.push(
            `[MULTIMODAL_INLINE id="${item.id}" mime="${item.mimeType}" tokens=${item.estimatedTokens}]\n${item.dataUri ?? item.referencePath ?? ""}\n[/MULTIMODAL_INLINE]`
          );
          break;

        case "reference":
          formattedBlocks.push(
            `[MULTIMODAL_REF id="${item.id}" mime="${item.mimeType}" path="${item.referencePath ?? "memory"}" tokens=${item.estimatedTokens}]`
          );
          break;

        case "multimodal_block":
          formattedBlocks.push(
            `\`\`\`multimodal\nid: ${item.id}\nkind: ${item.kind}\nmime: ${item.mimeType}\npath: ${item.referencePath ?? "inline"}\nestimated_tokens: ${item.estimatedTokens}\n\`\`\``
          );
          break;
      }
    }

    return {
      formattedContext: formattedBlocks.join("\n\n"),
      totalTokens: accumulatedTokens,
      itemsIncluded,
    };
  }
}
