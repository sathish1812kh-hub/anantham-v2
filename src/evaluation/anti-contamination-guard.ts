/**
 * Evaluation Integrity & Anti-Contamination Invariants
 * PRD-INV-005: Evaluation Integrity & Anti-Contamination Invariants
 */

import { createHash } from "node:crypto";

export interface BenchmarkFingerprint {
  benchmarkName: string;
  testHashes: Set<string>;
}

export class AntiContaminationGuard {
  private benchmarkFingerprints: Map<string, BenchmarkFingerprint> = new Map();

  public registerBenchmarkDataset(benchmarkName: string, testSamples: string[]): void {
    const hashes = new Set<string>();
    for (const sample of testSamples) {
      const normalized = this.normalizeText(sample);
      const hash = createHash("sha256").update(normalized).digest("hex");
      hashes.add(hash);
    }

    this.benchmarkFingerprints.set(benchmarkName, {
      benchmarkName,
      testHashes: hashes,
    });
  }

  public detectContamination(
    benchmarkName: string,
    promptOrContext: string
  ): { contaminated: boolean; matchedHash?: string; reason?: string } {
    const fp = this.benchmarkFingerprints.get(benchmarkName);
    if (!fp) {
      return { contaminated: false };
    }

    const normPrompt = this.normalizeText(promptOrContext);
    const promptHash = createHash("sha256").update(normPrompt).digest("hex");

    if (fp.testHashes.has(promptHash)) {
      return {
        contaminated: true,
        matchedHash: promptHash,
        reason: `Exact test sample leakage detected in prompt context for benchmark '${benchmarkName}'`,
      };
    }

    return { contaminated: false };
  }

  private normalizeText(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, " ");
  }
}
