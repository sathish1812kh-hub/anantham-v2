import { describe, it, expect } from "vitest";
import { PerceptualHasher } from "../../src/multimodal/perceptual-hasher.js";

describe("PRD-MM-006: Multimodal Memory & Caching", () => {
  const hasher = new PerceptualHasher();

  it("computes dHash and matches identical and near-identical buffers via Hamming distance", () => {
    const bufferA = Buffer.from("IMAGE_PIXEL_DATA_VERSION_1_A_B_C_D_E_F_G_H_I_J_K_L_M_N_O_P");
    const bufferB = Buffer.from("IMAGE_PIXEL_DATA_VERSION_1_A_B_C_D_E_F_G_H_I_J_K_L_M_N_O_P"); // Exact match
    const bufferDifferent = Buffer.from("COMPLETELY_DIFFERENT_IMAGE_DATA_00000000000000000000000000000");

    const hashA = hasher.computeDHash(bufferA);
    const hashB = hasher.computeDHash(bufferB);
    const hashDiff = hasher.computeDHash(bufferDifferent);

    expect(hashA).toBe(hashB);
    expect(hasher.hammingDistance(hashA, hashB)).toBe(0);
    expect(hasher.hammingDistance(hashA, hashDiff)).toBeGreaterThan(0);

    // Cache storing and retrieval
    hasher.store("item_1", bufferA, { title: "Architecture diagram" });
    const cachedHit = hasher.lookupSimilar(bufferB, 0);
    expect(cachedHit).toBeDefined();
    expect(cachedHit?.id).toBe("item_1");
  });
});
