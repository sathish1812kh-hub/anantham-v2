/**
 * A/B Testing Engine for Prompt Variants & Agent Configurations
 * PRD-PART2-317: A/B Testing Engine for Prompt Variants & Agent Configurations
 */

export interface ExperimentVariant {
  id: string; // e.g. "variant_a", "variant_b"
  name: string;
  weight: number; // 0.0 to 1.0 (traffic share)
  promptTemplate: string;
  config: Record<string, unknown>;
}

export interface VariantMetrics {
  impressions: number;
  successes: number;
  failures: number;
  successRate: number;
}

export class AbTestingEngine {
  private variants: ExperimentVariant[] = [];
  private metrics: Map<string, VariantMetrics> = new Map();

  constructor(variants: ExperimentVariant[] = []) {
    for (const v of variants) {
      this.addVariant(v);
    }
  }

  public addVariant(variant: ExperimentVariant): void {
    this.variants.push(variant);
    this.metrics.set(variant.id, {
      impressions: 0,
      successes: 0,
      failures: 0,
      successRate: 0.0,
    });
  }

  public routeRequest(seed = Math.random()): ExperimentVariant {
    if (this.variants.length === 0) {
      throw new Error("No variants configured in A/B testing engine");
    }

    const totalWeight = this.variants.reduce((acc, v) => acc + v.weight, 0);
    let randomVal = seed * totalWeight;

    for (const v of this.variants) {
      if (randomVal <= v.weight) {
        const m = this.metrics.get(v.id)!;
        m.impressions++;
        return v;
      }
      randomVal -= v.weight;
    }

    const fallback = this.variants[0]!;
    this.metrics.get(fallback.id)!.impressions++;
    return fallback;
  }

  public recordOutcome(variantId: string, success: boolean): void {
    const m = this.metrics.get(variantId);
    if (!m) return;

    if (success) {
      m.successes++;
    } else {
      m.failures++;
    }

    const total = m.successes + m.failures;
    m.successRate = total > 0 ? Number((m.successes / total).toFixed(4)) : 0;
  }

  public getVariantMetrics(variantId: string): VariantMetrics | undefined {
    return this.metrics.get(variantId);
  }

  public getAllMetrics(): Record<string, VariantMetrics> {
    const res: Record<string, VariantMetrics> = {};
    for (const [id, m] of this.metrics.entries()) {
      res[id] = { ...m };
    }
    return res;
  }
}
