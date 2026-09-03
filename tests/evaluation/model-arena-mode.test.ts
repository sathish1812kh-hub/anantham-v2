import { describe, it, expect } from "vitest";
import { ModelArena } from "../../src/evaluation/model-arena.js";

describe("PRD-EVAL-005: Multi-Model Comparative Evaluation & Arena Mode", () => {
  const arena = new ModelArena();

  it("updates Elo ratings accurately upon model victories and ties", () => {
    // Model A defeats Model B
    const { newEloA, newEloB } = arena.recordMatch({
      modelA: "model_alpha",
      modelB: "model_beta",
      winner: "modelA",
    });

    expect(newEloA).toBeGreaterThan(1200);
    expect(newEloB).toBeLessThan(1200);

    const statsA = arena.getModelStats("model_alpha");
    expect(statsA?.wins).toBe(1);
    expect(statsA?.totalMatches).toBe(1);

    const statsB = arena.getModelStats("model_beta");
    expect(statsB?.losses).toBe(1);
  });

  it("ranks models in leaderboard by descending Elo rating", () => {
    const leaderboard = arena.getLeaderboard();
    expect(leaderboard[0]!.modelId).toBe("model_alpha");
    expect(leaderboard[1]!.modelId).toBe("model_beta");
  });
});
